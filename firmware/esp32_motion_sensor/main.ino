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
#include <ledc.h>

#include "config.h"

// --- Global Variables ---
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Sensor data storage
struct MotionSensorData {
  bool pir_state;
  bool pir_debounced;
  unsigned long last_motion_time;
  unsigned long timestamp;
} sensorData;

// Buzzer state
int buzzer_frequency = BUZZER_FREQ_SILENT;
int buzzer_duty_cycle = 0;
bool buzzer_active = false;

// Timing
unsigned long last_sensor_read_ms = 0;
unsigned long last_mqtt_publish_ms = 0;
unsigned long pir_last_change_ms = 0;

// FSM state from RPi
String current_fsm_state = "IDLE";

// --- Function Prototypes ---
void setupWiFi();
void setupMQTT();
void setupBuzzer();
void readSensors();
void publishSensorData();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setBuzzer(int frequency, int duty_cycle);
void updateBuzzer();
void handleFSMState(const String& state);

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);
  
  Serial.println("\n\n#########################################################");
  Serial.println("  INIT: ESP32 #2 MOTION SENSOR NODE BOOTING...");
  Serial.println("#########################################################");

  // Initialize GPIO
  pinMode(PIR_PIN, INPUT);
  Serial.println("[PIR] Sensor initialized");

  // Initialize buzzer
  setupBuzzer();

  // Initialize WiFi
  setupWiFi();

  // Initialize MQTT
  setupMQTT();

  Serial.println("[INIT] MOTION SENSOR NODE ONLINE.");
  Serial.println("#########################################################\n");
}

void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    setupMQTT();
  }
  mqttClient.loop();

  // Read sensors at interval
  unsigned long current_ms = millis();
  if (current_ms - last_sensor_read_ms >= 100) {  // Read PIR every 100ms
    last_sensor_read_ms = current_ms;
    readSensors();
  }

  // Publish sensor data on change or every second
  if (sensorData.pir_debounced != sensorData.pir_state || 
      current_ms - last_mqtt_publish_ms >= 1000) {
    last_mqtt_publish_ms = current_ms;
    publishSensorData();
  }

  // Update buzzer
  updateBuzzer();

  delay(10);
}

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
      
      // Subscribe to actuator control topics
      mqttClient.subscribe(TOPIC_ACTUATOR_BUZZER);
      mqttClient.subscribe(TOPIC_AGGREGATE_FSM);
      Serial.println("[MQTT] Subscribed to control topics");
    } else {
      Serial.printf("[MQTT] Failed, rc=%d. Retrying in 5 seconds...\n", mqttClient.state());
      delay(5000);
    }
  }
}

void setupBuzzer() {
  // Configure LEDC for PWM buzzer control
  ledcSetup(BUZZER_LEDC_CHANNEL, BUZZER_BASE_FREQ, BUZZER_RESOLUTION);
  ledcAttachPin(BUZZER_PIN, BUZZER_LEDC_CHANNEL);
  ledcWrite(BUZZER_LEDC_CHANNEL, 0);  // Start with buzzer off
  Serial.println("[Buzzer] PWM initialized");
}

void readSensors() {
  // Read PIR
  bool pir_raw = digitalRead(PIR_PIN);
  
  // Debounce PIR
  unsigned long current_ms = millis();
  if (pir_raw != sensorData.pir_state) {
    pir_last_change_ms = current_ms;
    sensorData.pir_state = pir_raw;
  }
  
  // Apply debounce
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
  // Create JSON document
  StaticJsonDocument<256> doc;
  
  doc["node_id"] = "motion_sensor";
  doc["pir_state"] = sensorData.pir_debounced;
  doc["pir_raw"] = sensorData.pir_state;
  doc["last_motion_time"] = sensorData.last_motion_time;
  doc["timestamp"] = sensorData.timestamp;
  doc["buzzer_active"] = buzzer_active;
  doc["buzzer_frequency"] = buzzer_frequency;

  // Serialize JSON
  char buffer[256];
  serializeJson(doc, buffer);

  // Publish sensor data
  if (mqttClient.publish(TOPIC_MOTION_SENSORS, buffer)) {
#if DEBUG_LOG
    Serial.printf("[MQTT] Published motion data: %s\n", buffer);
#endif
  } else {
    Serial.println("[MQTT] Failed to publish motion data");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming MQTT messages
  Serial.printf("[MQTT] Received message on topic: %s\n", topic);
  
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.printf("[MQTT] Payload: %s\n", message);

  // Parse JSON
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.printf("[MQTT] JSON parse error: %s\n", error.c_str());
    return;
  }

  // Handle buzzer commands
  if (strcmp(topic, TOPIC_ACTUATOR_BUZZER) == 0) {
    int freq = doc["frequency"] | 0;
    int duty = doc["duty_cycle"] | 0;
    bool active = doc["active"] | false;
    
    if (active) {
      setBuzzer(freq, duty);
      buzzer_active = true;
      Serial.printf("[Buzzer] Activated at %d Hz\n", freq);
    } else {
      setBuzzer(0, 0);
      buzzer_active = false;
      Serial.println("[Buzzer] Deactivated");
    }
  }
  
  // Handle FSM state updates
  if (strcmp(topic, TOPIC_AGGREGATE_FSM) == 0) {
    const char* state = doc["state"];
    if (state) {
      current_fsm_state = String(state);
      handleFSMState(current_fsm_state);
    }
  }
}

void setBuzzer(int frequency, int duty_cycle) {
  buzzer_frequency = frequency;
  buzzer_duty_cycle = duty_cycle;
  
  if (frequency > 0) {
    ledcSetup(BUZZER_LEDC_CHANNEL, frequency, BUZZER_RESOLUTION);
    ledcWrite(BUZZER_LEDC_CHANNEL, duty_cycle);
  } else {
    ledcWrite(BUZZER_LEDC_CHANNEL, 0);
  }
}

void updateBuzzer() {
  // Buzzer is controlled via MQTT commands
  // This function can be used for periodic updates if needed
}

void handleFSMState(const String& state) {
  Serial.printf("[FSM] State changed to: %s\n", state.c_str());
  
  // Auto-configure buzzer based on FSM state
  if (state == "CRITICAL") {
    setBuzzer(BUZZER_FREQ_HIGH, 128);  // 50% duty cycle
    buzzer_active = true;
  } else if (state == "ALERT_HIGH") {
    setBuzzer(BUZZER_FREQ_MEDIUM, 128);
    buzzer_active = true;
  } else if (state == "ALERT_LOW") {
    setBuzzer(BUZZER_FREQ_LOW, 128);
    buzzer_active = true;
  } else {
    setBuzzer(0, 0);
    buzzer_active = false;
  }
}
