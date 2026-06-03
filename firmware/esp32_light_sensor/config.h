// Smart Home Monitoring System — ESP32 #3 Light & Status Node Config
#ifndef CONFIG_H
#define CONFIG_H

// --- Hardware GPIO Configurations ---
#define LDR_ADC_PIN      33   // ADC1_CH5 (GPIO33) for LDR
#define LCD_SDA_PIN   21   // Physical pin D21 (GPIO21) for I2C SDA
#define LCD_SCL_PIN   22   // Physical pin D22 (GPIO22) for I2C SCL

// --- LCD I2C Configuration ---
#define LCD_I2C_ADDR 0x27   // 0x27 or 0x3F depending on backpack
#define LCD_COLUMNS 16
#define LCD_ROWS 2

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
