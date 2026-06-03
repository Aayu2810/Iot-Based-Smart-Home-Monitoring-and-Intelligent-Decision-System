/**
 * =========================================================================
 * Smart Home Monitoring System — ESP32 #1 Environmental Sensor Node
 * =========================================================================
 * Sensors: MQ-2 (gas/smoke), DHT11 (temperature & humidity)
 * Publishes sensor data to Raspberry Pi via MQTT
 * =========================================================================
 */

#include <Arduino.h>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "config.h"

// --- Global Variables ---
DHT dht11_sensor(DHT11_DATA_PIN, DHT11);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Sensor data storage
struct EnvSensorData {
  float temperature;
  float humidity;
  float gas_ppm;
  unsigned long timestamp;
} sensorData;

// Calibration data
float mq2_r0_baseline = 10000.0f;
bool mq2_warmed_up = false;

// Timing
unsigned long last_sensor_read_ms = 0;
unsigned long last_mqtt_publish_ms = 0;

// --- Function Prototypes ---
void setupWiFi();
void setupMQTT();
void readSensors();
float readMQ2PPM(int adc_raw);
void publishSensorData();
void mqttCallback(char* topic, byte* payload, unsigned int length);

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);
  
  Serial.println("\n\n#########################################################");
  Serial.println("  INIT: ESP32 #1 ENVIRONMENTAL SENSOR NODE BOOTING...");
  Serial.println("#########################################################");

  // Initialize DHT11
  dht11_sensor.begin();
  Serial.println("[DHT11] Sensor initialized");

  // Initialize WiFi
  setupWiFi();

  // Initialize MQTT
  setupMQTT();

  // MQ-2 Warmup
  Serial.println("[MQ-2] Starting 20-second warmup period...");
  delay(MQ2_WARMUP_MS);
  mq2_warmed_up = true;
  Serial.println("[MQ-2] Warmup complete");

  Serial.println("[INIT] ENVIRONMENTAL SENSOR NODE ONLINE.");
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
  if (current_ms - last_sensor_read_ms >= SENSOR_READ_INTERVAL_MS) {
    last_sensor_read_ms = current_ms;
    readSensors();
    publishSensorData();
  }

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
      mqttClient.subscribe(TOPIC_ACTUATOR_LEDS);
      Serial.println("[MQTT] Subscribed to actuator control topics");
    } else {
      Serial.printf("[MQTT] Failed, rc=%d. Retrying in 5 seconds...\n", mqttClient.state());
      delay(5000);
    }
  }
}

void readSensors() {
  // Read DHT11
  float temp = dht11_sensor.readTemperature();
  float hum = dht11_sensor.readHumidity();

  if (isnan(temp)) {
    temp = 0.0f;
    Serial.println("[DHT11] Failed to read temperature");
  }
  if (isnan(hum)) {
    hum = 0.0f;
    Serial.println("[DHT11] Failed to read humidity");
  }

  // Read MQ-2
  int adc_raw = analogRead(MQ2_ADC_PIN);
  float gas_ppm = 0.0f;
  
  if (mq2_warmed_up) {
    gas_ppm = readMQ2PPM(adc_raw);
  } else {
    gas_ppm = 0.0f;
  }

  // Store sensor data
  sensorData.temperature = temp;
  sensorData.humidity = hum;
  sensorData.gas_ppm = gas_ppm;
  sensorData.timestamp = millis();

#if DEBUG_LOG
  Serial.printf("[Sensors] T=%.1f°C, H=%.1f%%, Gas=%.1fppm (ADC=%d)\n", 
                temp, hum, gas_ppm, adc_raw);
#endif
}

float readMQ2PPM(int adc_raw) {
  // Convert ADC to voltage (0-4095 -> 0-3.3V)
  float v_adc = (adc_raw * 3.3f) / 4095.0f;
  
  // Re-scale for voltage divider (assuming 2:1 divider)
  float v_mq2 = v_adc * 2.0f;
  
  // Calculate RS
  float rs = ((5.0f / v_mq2) - 1.0f) * 10000.0f;
  
  // Calculate ratio
  float ratio = rs / mq2_r0_baseline;
  
  // Calculate PPM using power regression
  float ppm = MQ2_A * pow(ratio, MQ2_B);
  
  // Clamp to reasonable range
  if (ppm < 0) ppm = 0;
  if (ppm > 10000) ppm = 10000;
  
  return ppm;
}

void publishSensorData() {
  // Create JSON document
  StaticJsonDocument<256> doc;
  
  doc["node_id"] = "env_sensor";
  doc["temperature"] = sensorData.temperature;
  doc["humidity"] = sensorData.humidity;
  doc["gas_ppm"] = sensorData.gas_ppm;
  doc["timestamp"] = sensorData.timestamp;
  
  // Add normalized values (simple normalization for demo)
  doc["temp_norm"] = min(1.0f, max(0.0f, sensorData.temperature / 50.0f));
  doc["hum_norm"] = min(1.0f, max(0.0f, sensorData.humidity / 100.0f));
  doc["gas_norm"] = min(1.0f, max(0.0f, sensorData.gas_ppm / 1000.0f));

  // Serialize JSON
  char buffer[256];
  serializeJson(doc, buffer);

  // Publish raw sensor data
  if (mqttClient.publish(TOPIC_ENV_SENSORS, buffer)) {
#if DEBUG_LOG
    Serial.printf("[MQTT] Published sensor data: %s\n", buffer);
#endif
  } else {
    Serial.println("[MQTT] Failed to publish sensor data");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming MQTT messages (actuator commands from RPi)
  Serial.printf("[MQTT] Received message on topic: %s\n", topic);
  
  char message[length + 1];
  memcpy(message, payload, length);
  message[length] = '\0';
  
  Serial.printf("[MQTT] Payload: %s\n", message);
  
  // ESP32 #1 doesn't have actuators, but logs commands for debugging
  if (strcmp(topic, TOPIC_ACTUATOR_BUZZER) == 0) {
    Serial.println("[MQTT] Buzzer command received (not applicable to this node)");
  } else if (strcmp(topic, TOPIC_ACTUATOR_LEDS) == 0) {
    Serial.println("[MQTT] LED command received (not applicable to this node)");
  }
}
