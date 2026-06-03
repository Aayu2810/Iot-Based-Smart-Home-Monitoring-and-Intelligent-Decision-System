// Smart Home Monitoring System — ESP32 #3 Light & Status Node (LCD display)
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#include "config.h"

// Global objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, 16, 2); // 16x2 LCD

// Sensor data structure
struct LightData {
  uint16_t ldr_raw;
  float ldr_norm; // 0.0 - 1.0
  unsigned long timestamp;
} lightData;

// Timing helpers
unsigned long lastSensorRead = 0;
unsigned long lastPublish = 0;
unsigned long lastLcdUpdate = 0;
const unsigned long LCD_UPDATE_MS = 2000; // update LCD every 2 s

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
  // This node does not act on incoming commands besides the optional LED topic (kept for compatibility)
  // No action needed for LCD display
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);

  // Initialise LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Smart Home LCD");

  // Wi‑Fi and MQTT setup
  setupWiFi();
  mqttClient.setServer(MQTT_BROKER_IP, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  // Connect & subscribe (topic kept for legacy LED control)
  while (!mqttClient.connected()) {
    Serial.println("[MQTT] Connecting to broker...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATOR_LED);
    } else {
      Serial.printf("[MQTT] Failed rc=%d, retry in 3s\n", mqttClient.state());
      delay(3000);
    }
  }

  Serial.println("[INIT] Light & LCD node ready");
}

void loop() {
  if (!mqttClient.connected()) {
    // Re‑connect logic
    while (!mqttClient.connected()) {
      Serial.println("[MQTT] Reconnecting...");
      if (mqttClient.connect(MQTT_CLIENT_ID)) {
        Serial.println("[MQTT] Reconnected");
        mqttClient.subscribe(TOPIC_ACTUATOR_LED);
      } else {
        delay(3000);
      }
    }
  }
  mqttClient.loop();

  unsigned long now = millis();

  // Read LDR periodically
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
    lastSensorRead = now;
    lightData.ldr_raw = analogRead(LDR_ADC_PIN);
    lightData.ldr_norm = (float)lightData.ldr_raw / 4095.0f;
    lightData.timestamp = now;
  }

  // Publish LDR data at 1 Hz
  if (now - lastPublish >= 1000) {
    lastPublish = now;
    StaticJsonDocument<256> doc;
    doc["node_id"] = "light_status";
    doc["ldr_raw"] = lightData.ldr_raw;
    doc["ldr_norm"] = lightData.ldr_norm;
    doc["timestamp"] = lightData.timestamp;
    char buff[256];
    serializeJson(doc, buff);
    if (mqttClient.publish(TOPIC_LIGHT_SENSORS, buff)) {
      #if DEBUG_LOG
      Serial.printf("[MQTT] Published LDR: %s\n", buff);
      #endif
    } else {
      Serial.println("[MQTT] Publish failed");
    }
  }

  // Update LCD display every LCD_UPDATE_MS
  if (now - lastLcdUpdate >= LCD_UPDATE_MS) {
    lastLcdUpdate = now;
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LDR:");
    lcd.print(lightData.ldr_raw);
    lcd.setCursor(0, 1);
    lcd.print("Norm:");
    lcd.print(lightData.ldr_norm, 2);
  }

  delay(10);
}

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#include "config.h"

// Global objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Sensor data structure
struct LightStatusData {
  uint16_t ldr_raw;
  float ldr_norm; // 0.0 - 1.0
  unsigned long timestamp;
} sensorData;

// LED state map (5 LEDs)
struct LedState {
  bool red;
  bool orange;
  bool yellow;
  bool green;
  bool blue;
} ledState = {false, false, false, false, false};

// Timing
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

  // Expect JSON payload like {"red":true,"green":false,...}
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err) {
    Serial.printf("[MQTT] JSON parse error: %s\n", err.c_str());
    return;
  }
  // Update LED states if fields exist
  if (doc.containsKey("red"))    ledState.red    = doc["red"];
  if (doc.containsKey("orange")) ledState.orange = doc["orange"];
  if (doc.containsKey("yellow")) ledState.yellow = doc["yellow"];
  if (doc.containsKey("green"))  ledState.green  = doc["green"];
  if (doc.containsKey("blue"))   ledState.blue   = doc["blue"];

  // Apply to hardware
  digitalWrite(RED_LED_PIN,    ledState.red    ? HIGH : LOW);
  digitalWrite(ORANGE_LED_PIN, ledState.orange ? HIGH : LOW);
  digitalWrite(YELLOW_LED_PIN, ledState.yellow ? HIGH : LOW);
  digitalWrite(GREEN_LED_PIN,  ledState.green  ? HIGH : LOW);
  digitalWrite(BLUE_LED_PIN,   ledState.blue   ? HIGH : LOW);

  Serial.println("[LED] Updated states from command");
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);

  // Initialize LED pins as outputs (active HIGH)
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(ORANGE_LED_PIN, OUTPUT);
  pinMode(YELLOW_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(BLUE_LED_PIN, OUTPUT);
  // Start with all LEDs off
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(ORANGE_LED_PIN, LOW);
  digitalWrite(YELLOW_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(BLUE_LED_PIN, LOW);

  setupWiFi();
  mqttClient.setServer(MQTT_BROKER_IP, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  // Subscribe to actuator topic for LED control
  while (!mqttClient.connected()) {
    Serial.println("[MQTT] Connecting to broker for LED control...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("[MQTT] Connected");
      mqttClient.subscribe(TOPIC_ACTUATOR_LEDS);
    } else {
      Serial.printf("[MQTT] Failed, rc=%d. Retry in 3s\n", mqttClient.state());
      delay(3000);
    }
  }

  Serial.println("[INIT] Light & Status node ready");
}

void loop() {
  if (!mqttClient.connected()) {
    // Reconnect and resubscribe
    while (!mqttClient.connected()) {
      Serial.println("[MQTT] Reconnecting...");
      if (mqttClient.connect(MQTT_CLIENT_ID)) {
        Serial.println("[MQTT] Reconnected");
        mqttClient.subscribe(TOPIC_ACTUATOR_LEDS);
      } else {
        delay(3000);
      }
    }
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL_MS) {
    lastSensorRead = now;
    // Read LDR ADC
    sensorData.ldr_raw = analogRead(LDR_ADC_PIN);
    // Normalize assuming 10k pull-down and 3.3V reference (simple linear mapping)
    sensorData.ldr_norm = (float)sensorData.ldr_raw / 4095.0f;
    sensorData.timestamp = now;
  }

  if (now - lastPublish >= 1000) { // publish at 1 Hz
    lastPublish = now;
    // Build JSON payload
    StaticJsonDocument<256> doc;
    doc["node_id"] = "light_status";
    doc["ldr_raw"] = sensorData.ldr_raw;
    doc["ldr_norm"] = sensorData.ldr_norm;
    doc["timestamp"] = sensorData.timestamp;
    char buffer[256];
    serializeJson(doc, buffer);
    if (mqttClient.publish(TOPIC_LIGHT_SENSORS, buffer)) {
      #if DEBUG_LOG
      Serial.printf("[MQTT] Published LDR data: %s\n", buffer);
      #endif
    } else {
      Serial.println("[MQTT] Publish failed");
    }
  }

  delay(10);
}
