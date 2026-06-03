import json
import logging
import time
import paho.mqtt.client as mqtt

logger = logging.getLogger("MQTTSubscriber")

class MQTTSubscriber:
    def __init__(self, host="localhost", port=1883):
        self.host = host
        self.port = port
        self.client = mqtt.Client(client_id="Pi_Coordinator")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        self.callbacks = {}
        self.last_messages = {}
        self.message_times = []
        self.expected_sequences = {}
        self.sequence_gaps = 0
        self.latencies = []

    def register_callback(self, topic_pattern, func):
        if topic_pattern not in self.callbacks:
            self.callbacks[topic_pattern] = []
        self.callbacks[topic_pattern].append(func)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected successfully to Mosquitto broker")
            self.client.subscribe("home/#")
        else:
            logger.error(f"MQTT Connection failed with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        logger.warning(f"MQTT Disconnected from broker. Code: {rc}")
        self._reconnect_loop()

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        payload_str = msg.payload.decode('utf-8', errors='ignore')
        self.message_times.append(time.time())
        
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
        while not self.client.is_connected():
            logger.info(f"Retrying connection in {delay} seconds...")
            time.sleep(delay)
            try:
                self.client.reconnect()
                break
            except Exception:
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

    def start(self):
        self.client.connect_async(self.host, self.port)
        self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
