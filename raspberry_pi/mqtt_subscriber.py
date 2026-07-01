import json
import logging
import time
import paho.mqtt.client as mqtt

logger = logging.getLogger("MQTTSubscriber")

# Check paho-mqtt version for callback compatibility
PAHO_MQTT_VERSION = getattr(mqtt, '__version__', '1.0.0')
PAHO_V2 = PAHO_MQTT_VERSION.startswith('2.')


class MQTTSubscriber:
    def __init__(self, host="localhost", port=1883):
        self.host = host
        self.port = port
        self.connected = False

        # Create client with version-appropriate API
        if PAHO_V2:
            # paho-mqtt 2.0+ uses CallbackAPIVersion
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION1,
                client_id="Pi_Coordinator"
            )
        else:
            # paho-mqtt 1.x
            self.client = mqtt.Client(client_id="Pi_Coordinator")

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        self.client.on_subscribe = self._on_subscribe

        self.subscribed = False
        self.callbacks = {}
        self.last_messages = {}
        self.message_times = []
        self.expected_sequences = {}
        self.sequence_gaps = 0
        self.latencies = []

        logger.info(f"MQTT Subscriber initialized (paho-mqtt version: {PAHO_MQTT_VERSION})")

    def register_callback(self, topic_pattern, func):
        if topic_pattern not in self.callbacks:
            self.callbacks[topic_pattern] = []
        self.callbacks[topic_pattern].append(func)

    def _on_connect(self, client, userdata, flags, rc):
        """
        Callback fired when MQTT client connects (or fails to connect).
        Compatible with paho-mqtt 1.x and 2.x (via CallbackAPIVersion.VERSION1).
        """
        if rc == 0:
            self.connected = True
            logger.info(f"Connected successfully to Mosquitto broker at {self.host}:{self.port}")
            # Subscribe to all home/* topics
            result, mid = self.client.subscribe("home/#", qos=1)
            if result == mqtt.MQTT_ERR_SUCCESS:
                logger.info(f"Subscribed to 'home/#' (mid={mid})")
            else:
                logger.error(f"Failed to subscribe to 'home/#': {result}")
        else:
            self.connected = False
            rc_codes = {
                1: "Incorrect protocol version",
                2: "Invalid client identifier",
                3: "Server unavailable",
                4: "Bad username or password",
                5: "Not authorized"
            }
            reason = rc_codes.get(rc, f"Unknown error code {rc}")
            logger.error(f"MQTT Connection failed: {reason}")

    def _on_subscribe(self, client, userdata, mid, granted_qos):
        """Callback fired when subscription is acknowledged by broker."""
        self.subscribed = True
        logger.info(f"Subscription confirmed (mid={mid}, QoS={granted_qos})")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        self.subscribed = False
        if rc == 0:
            logger.info("MQTT Disconnected cleanly from broker")
        else:
            logger.warning(f"MQTT Disconnected unexpectedly. Code: {rc}")
            self._reconnect_loop()

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload_str = msg.payload.decode('utf-8', errors='ignore')
        self.message_times.append(time.time())
        logger.debug(f"Message received on topic: {topic}")
        
        # Trim buffers
        if len(self.message_times) > 1000:
            self.message_times = self.message_times[-1000:]
            
        try:
            data = json.loads(payload_str)
            self.last_messages[topic] = data
            
            # Formulating schema checks
            if topic == "home/sensors/raw":
                # End-to-end latency calculations: Compare local time with ESP32 timestamp ms
                if "ts" in data:
                    esp_millis = data["ts"]
                    # Calculate relative latencies (highly accurate if clocks synchronize; otherwise relative)
                    # For local testing, we approximate millisecond deltas
                    r_time_ms = int(time.time() * 1000) % 86400000
                    esp_rel = esp_millis % 86400000
                    latency = abs(r_time_ms - esp_rel)
                    self.latencies.append(latency)
                    if len(self.latencies) > 500:
                        self.latencies = self.latencies[-500:]

                # Sequence gap audits
                if "seq" in data:
                    seq = data["seq"]
                    if topic in self.expected_sequences:
                        expected = self.expected_sequences[topic]
                        if seq != expected:
                            gap = seq - expected
                            self.sequence_gaps += abs(gap)
                            logger.warning(f"[Sequence Gap] Expected: {expected} != Recv: {seq} (Gap: {gap})")
                    self.expected_sequences[topic] = seq + 1

            # Dispatch callbacks
            for pattern, funclist in self.callbacks.items():
                if pattern == topic or (pattern.endswith("#") and topic.startswith(pattern[:-1])):
                    for f in funclist:
                        try:
                            f(topic, data)
                        except Exception as ex:
                            logger.error(f"Error in callback function: {ex}")

        except json.JSONDecodeError:
            logger.error(f"Failed to decode non-JSON frame on topic {topic}: {payload_str[:50]}")

    def _reconnect_loop(self):
        delay = 1
        max_delay = 60
        while not self.connected:
            logger.info(f"Attempting MQTT reconnection in {delay} seconds...")
            time.sleep(delay)
            try:
                self.client.reconnect()
                # Wait for _on_connect callback to set self.connected
                time.sleep(1)
                if self.connected:
                    logger.info("MQTT reconnection successful")
                    break
            except Exception as e:
                logger.error(f"Reconnection failed: {e}")
                delay = min(delay * 2, max_delay)

    def get_last_message(self, topic):
        return self.last_messages.get(topic)

    def get_message_rate(self):
        now = time.time()
        cutoff = now - 60.0
        active_msgs = [t for t in self.message_times if t > cutoff]
        return len(active_msgs) / 60.0

    def get_average_latency_ms(self):
        if not self.latencies: return 0.0
        return sum(self.latencies) / len(self.latencies)

    def publish_message(self, topic, payload):
        """
        Publish a message to an MQTT topic.

        Args:
            topic (str): MQTT topic to publish to
            payload (str or dict): Message payload. Dicts are JSON-serialized.

        Returns:
            MQTTMessageInfo: Result of the publish operation
        """
        try:
            # JSON serialize dict payloads
            if isinstance(payload, dict):
                payload_str = json.dumps(payload)
            else:
                payload_str = str(payload)

            # Publish using Paho client
            result = self.client.publish(topic, payload_str)

            # Log result
            if result.rc == 0:
                logger.info(f"Published to {topic}: {payload_str[:100]}")
            else:
                logger.error(f"Failed to publish to {topic}. RC: {result.rc}")

            return result

        except Exception as e:
            logger.error(f"Error publishing message to {topic}: {e}")
            return None

    def publish(self, topic, payload):
        """
        Paho MQTT client compatibility wrapper for publish_message().

        Allows MQTTSubscriber to be used as a drop-in replacement for
        paho.mqtt.client.Client when publishing is required.

        Args:
            topic (str): MQTT topic to publish to
            payload (str or dict): Message payload. Dicts are JSON-serialized.

        Returns:
            MQTTMessageInfo: Result of the publish operation
        """
        return self.publish_message(topic, payload)

    def start(self):
        """
        Connect to MQTT broker and start the network loop.
        Uses synchronous connect with timeout to ensure connection before proceeding.
        """
        logger.info(f"Connecting to MQTT broker at {self.host}:{self.port}...")
        try:
            # Use synchronous connect with keepalive
            self.client.connect(self.host, self.port, keepalive=60)
            # Start background network loop
            self.client.loop_start()
            # Wait briefly for connection callback to fire
            timeout = 5.0
            start_time = time.time()
            while not self.connected and (time.time() - start_time) < timeout:
                time.sleep(0.1)
            if self.connected:
                logger.info("MQTT connection established and subscriptions active")
            else:
                logger.warning("MQTT connection timeout - callbacks may not fire")
        except Exception as e:
            logger.error(f"Failed to connect to MQTT broker: {e}")
            # Fallback to async connection with reconnect loop
            self.client.connect_async(self.host, self.port)
            self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
