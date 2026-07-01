// Smart Home Monitoring System — ESP32 #3 Light & Status Node Config
#ifndef CONFIG_H
#define CONFIG_H

// --- Hardware GPIO Configurations ---
#define LDR_ADC_PIN      33   // ADC1_CH5 (GPIO33) for LDR voltage divider
// Wiring: 3.3V → LDR → GPIO33 → 10kΩ → GND
// NOTE: GPIO12 is a boot-strapping pin — wire LED active-HIGH (GPIO12 → R → GND) only
#define SINGLE_LED_PIN   2    // GPIO2 (onboard LED or external LED)

// --- WiFi Credentials & Server Targets ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define WIFI_TIMEOUT_MS 10000

#define MQTT_BROKER_IP "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "SmartHome_ESP32_Light"
#define MQTT_MAX_RETRIES 3

// --- MQTT Topic Names ---
#define TOPIC_LIGHT_SENSORS "home/node/light/sensors"
#define TOPIC_ACTUATOR_LED "home/actuator/led" // Subscribe for LED command

// --- Sensor Calibration Constants ---
#define LDR_PULLDOWN_R 10000 // 10kΩ pull-down resistor

// --- Diagnostics & Performance ---
#define SENSOR_READ_INTERVAL_MS 1000 // 1 second
#define SERIAL_BAUD 115200
#define DEBUG_LOG true

#endif // CONFIG_H
