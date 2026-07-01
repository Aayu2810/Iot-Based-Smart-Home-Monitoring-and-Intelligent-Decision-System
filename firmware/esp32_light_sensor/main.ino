// Smart Home Monitoring System — ESP32 #3 Light & Status Node (LDR + single LED)
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "config.h"

// Global objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Sensor data structure
struct LightData {
  uint16_t ldr_raw;
  float ldr_norm; // 0.0 - 1.0
  unsigned long timestamp;
} lightData;

// Single LED state
bool single_led_state = false;

// Timing helpers
unsigned long lastSensorRead = 0;
unsigned long lastPublish = 0;

void setupWiFi() {
  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WiFi] Connection failed – proceeding offline");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Received on %s\n", topic);
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  // Expect JSON payload like {"led_on":true}
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.printf("[MQTT] JSON parse error: %s\n", err.c_str());
    return;
  }

  if (doc.containsKey("led_on")) {
    single_led_state = doc["led_on"];
    digitalWrite(SINGLE_LED_PIN, single_led_state ? HIGH : LOW);
    Serial.printf("[LED] Updated state to %d\n", single_led_state);
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);

  // Initialize LED pin
  pinMode(SINGLE_LED_PIN, OUTPUT);
  digitalWrite(SINGLE_LED_PIN, LOW);

  // Wi-Fi and MQTT setup
  setupWiFi();
  mqttClient.setServer(MQTT_BROKER_IP, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  // Connect & subscribe
  unsigned long mqttStart = millis();
  while (!mqttClient.connected() && WiFi.status() == WL_CONNECTED &&
         (millis() - mqttStart) < 10000) {
    Serial.println("[MQTT] Connecting to broker...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATOR_LED);
    } else {
      Serial.printf("[MQTT] Failed rc=%d, retry in 3s\n", mqttClient.state());
      delay(3000);
    }
  }

  Serial.println("[INIT] Light node ready");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    Serial.println("[MQTT] Reconnecting...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Reconnected");
      mqttClient.subscribe(TOPIC_ACTUATOR_LED);
    }
  }

  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  unsigned long now = millis();

  // Read LDR periodically
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
    lastSensorRead = now;
    lightData.ldr_raw = analogRead(LDR_ADC_PIN);
    lightData.ldr_norm = (float)lightData.ldr_raw / 4095.0f;
    lightData.timestamp = now;
  }

  // Publish LDR data at 1 Hz
  if (now - lastPublish >= 1000) {
    lastPublish = now;
    StaticJsonDocument<256> doc;
    doc["node_id"] = "light_status";
    doc["ldr_raw"] = lightData.ldr_raw;
    doc["ldr_norm"] = lightData.ldr_norm;
    doc["timestamp"] = lightData.timestamp;
    char buff[256];
    serializeJson(doc, buff);

    if (mqttClient.connected()) {
      if (mqttClient.publish(TOPIC_LIGHT_SENSORS, buff)) {
        #if DEBUG_LOG
        Serial.printf("[MQTT] Published LDR: %s\n", buff);
        #endif
      } else {
        Serial.println("[MQTT] Publish failed");
      }
    }
  }

  delay(10);
}
