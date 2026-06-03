/**
 * =========================================================================
 * Smart Home Monitoring System — ESP32 #1 Environmental Sensor Config
 * =========================================================================
 * Pin mappings, thresholds, network parameters for environmental sensing node
 * Sensors: MQ-2 (gas/smoke), DHT11 (temperature & humidity)
 * =========================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Hardware GPIO Configurations ---
#define DHT11_DATA_PIN    4     // Digital I/O (One-wire protocol)
#define MQ2_ADC_PIN      34     // Analog Input (ADC1_CH6) — INPUT ONLY

// --- WiFi Credentials & Server Targets ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define WIFI_TIMEOUT_MS 10000

#define MQTT_BROKER_IP "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "SmartHome_ESP32_Env"
#define MQTT_MAX_RETRIES 3

// --- MQTT Topic Names ---
#define TOPIC_ENV_SENSORS "home/node/env/sensors"
#define TOPIC_ENV_NORMALIZED "home/node/env/normalized"
#define TOPIC_ACTUATOR_BUZZER "home/actuator/buzzer"  // Subscribe for commands
#define TOPIC_ACTUATOR_LEDS "home/actuator/leds"      // Subscribe for commands

// --- Sensor Calibration Constants ---
#define TEMP_OFFSET 0.82f      // Calibration delta
#define MQ2_A 574.25f          // Scaling coefficient
#define MQ2_B -2.222f          // Power regression scaling exponent
#define MQ2_WARMUP_MS 20000    // Warmup period (millis)

// --- Sensor Thresholds ---
#define TEMP_THRESHOLD_HIGH 35.0f
#define TEMP_THRESHOLD_CRITICAL 45.0f
#define HUMIDITY_THRESHOLD_HIGH 80.0f
#define GAS_PPM_THRESHOLD 300.0f
#define GAS_PPM_CRITICAL 500.0f

// --- Diagnostics & Performance ---
#define SENSOR_READ_INTERVAL_MS 1000  // Read sensors every 1 second
#define SERIAL_BAUD 115200

#define DEBUG_LOG true

#endif // CONFIG_H
