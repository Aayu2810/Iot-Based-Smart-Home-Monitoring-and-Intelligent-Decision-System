/**
 * =========================================================================
 * Smart Home Monitoring System — ESP32 #2 Motion Sensor Node
 * =========================================================================
 * Sensors: PIR (motion detection), Buzzer (audio alert)
 * Publishes motion data to Raspberry Pi via MQTT
 * Receives buzzer commands from Raspberry Pi via MQTT
 * =========================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Hardware GPIO Configurations ---
#define PIR_PIN          27     // Digital Input
#define BUZZER_PIN       13     // Digital Output

// --- WiFi Credentials & Server Targets ---
#define WIFI_SSID "Oppo"
#define WIFI_PASSWORD "00000000"
#define WIFI_TIMEOUT_MS 10000

#define MQTT_BROKER_IP "172.18.163.168"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "SmartHome_ESP32_Motion"

// --- MQTT Topic Names ---
#define TOPIC_MOTION_SENSORS "home/node/motion/sensors"
#define TOPIC_ACTUATOR_BUZZER "home/actuator/buzzer"
#define TOPIC_AGGREGATE_FSM "home/aggregate/fsm/state"

// --- Sensor Calibration Constants ---
// HC-SR501 output pulse width is typically 3s+ at minimum pot setting;
// 2500ms debounce filters electrical noise without masking real detections.
#define PIR_DEBOUNCE_MS 2500

// --- Diagnostics ---
#define SERIAL_BAUD 115200
#define DEBUG_LOG true

// --- Global Variables ---
WiFiClient espClient;
PubSubClient mqttClient(espClient);

struct MotionSensorData {
  bool pir_state;
  bool pir_debounced;
  unsigned long last_motion_time;
  unsigned long timestamp;
} sensorData;

bool buzzer_active = false;

unsigned long last_sensor_read_ms = 0;
unsigned long last_mqtt_publish_ms = 0;
unsigned long pir_last_change_ms = 0;

String current_fsm_state = "IDLE";

// --- Function Prototypes ---
void setupWiFi();
void setupMQTT();
void readSensors();
void publishSensorData();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setBuzzer(bool state);
void handleFSMState(const String& state);

// =========================================================================

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);

  Serial.println("\n\n#########################################################");
  Serial.println("  INIT: ESP32 #2 MOTION SENSOR NODE BOOTING...");
  Serial.println("#########################################################");

  pinMode(PIR_PIN, INPUT);
  Serial.println("[PIR] Sensor initialized");

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println("[Buzzer] Initialized");

  setupWiFi();
  setupMQTT();

  Serial.println("[INIT] MOTION SENSOR NODE ONLINE.");
  Serial.println("#########################################################\n");
}

void loop() {
  if (!mqttClient.connected()) {
    setupMQTT();
  }
  mqttClient.loop();

  unsigned long current_ms = millis();

  if (current_ms - last_sensor_read_ms >= 100) {
    last_sensor_read_ms = current_ms;
    readSensors();
  }

  if (sensorData.pir_debounced != sensorData.pir_state ||
      current_ms - last_mqtt_publish_ms >= 1000) {
    last_mqtt_publish_ms = current_ms;
    publishSensorData();
  }

  delay(10);
}

// =========================================================================

void setupWiFi() {
  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifi_start_ms = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifi_start_ms < WIFI_TIMEOUT_MS)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WiFi] Connection failed. Continuing in offline mode.");
  }
}

void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER_IP, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(60);

  while (!mqttClient.connected()) {
    Serial.printf("[MQTT] Connecting to broker at %s:%d...\n", MQTT_BROKER_IP, MQTT_PORT);

    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected to broker");
      mqttClient.subscribe(TOPIC_ACTUATOR_BUZZER);
      mqttClient.subscribe(TOPIC_AGGREGATE_FSM);
      Serial.println("[MQTT] Subscribed to control topics");
    } else {
      Serial.printf("[MQTT] Failed, rc=%d. Retrying in 5 seconds...\n", mqttClient.state());
      delay(5000);
    }
  }
}

void readSensors() {
  bool pir_raw = digitalRead(PIR_PIN);
  unsigned long current_ms = millis();

  if (pir_raw != sensorData.pir_state) {
    pir_last_change_ms = current_ms;
    sensorData.pir_state = pir_raw;
  }

  if (current_ms - pir_last_change_ms >= PIR_DEBOUNCE_MS) {
    sensorData.pir_debounced = sensorData.pir_state;
    if (sensorData.pir_debounced) {
      sensorData.last_motion_time = current_ms;
    }
  }

  sensorData.timestamp = current_ms;

#if DEBUG_LOG
  if (sensorData.pir_debounced != sensorData.pir_state) {
    Serial.printf("[PIR] Motion detected: %s\n", sensorData.pir_debounced ? "YES" : "NO");
  }
#endif
}

void publishSensorData() {
  StaticJsonDocument<256> doc;

  doc["node_id"]          = "motion_sensor";
  doc["pir_state"]        = sensorData.pir_debounced;
  doc["pir_raw"]          = sensorData.pir_state;
  doc["last_motion_time"] = sensorData.last_motion_time;
  doc["timestamp"]        = sensorData.timestamp;
  doc["buzzer_active"]    = buzzer_active;

  char buffer[256];
  serializeJson(doc, buffer);

  if (mqttClient.publish(TOPIC_MOTION_SENSORS, buffer)) {
#if DEBUG_LOG
    Serial.printf("[MQTT] Published motion data: %s\n", buffer);
#endif
  } else {
    Serial.println("[MQTT] Failed to publish motion data");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Received message on topic: %s\n", topic);

  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  Serial.printf("[MQTT] Payload: %s\n", message);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.printf("[MQTT] JSON parse error: %s\n", error.c_str());
    return;
  }

  if (strcmp(topic, TOPIC_ACTUATOR_BUZZER) == 0) {
    bool active = doc["active"] | false;
    setBuzzer(active);
  }

  if (strcmp(topic, TOPIC_AGGREGATE_FSM) == 0) {
    const char* state = doc["state"];
    if (state) {
      current_fsm_state = String(state);
      handleFSMState(current_fsm_state);
    }
  }
}

void setBuzzer(bool state) {
  buzzer_active = state;
  digitalWrite(BUZZER_PIN, state ? HIGH : LOW);
  Serial.printf("[Buzzer] %s\n", state ? "ON" : "OFF");
}

void handleFSMState(const String& state) {
  Serial.printf("[FSM] State changed to: %s\n", state.c_str());

  if (state == "CRITICAL" || state == "ALERT_HIGH" || state == "ALERT_LOW") {
    setBuzzer(true);
  } else {
    setBuzzer(false);
  }
}