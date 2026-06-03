/**
 * =========================================================================
 * Smart Home Monitoring System — ESP32 #2 Motion Sensor Config
 * =========================================================================
 * Pin mappings, thresholds, network parameters for motion detection node
 * Sensors: PIR (motion), Buzzer (audio alert)
 * =========================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Hardware GPIO Configurations ---
#define PIR_PIN          27     // Digital Input
#define BUZZER_PIN       13     // PWM Output (LEDC Channel 0)

// --- WiFi Credentials & Server Targets ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define WIFI_TIMEOUT_MS 10000

#define MQTT_BROKER_IP "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "SmartHome_ESP32_Motion"
#define MQTT_MAX_RETRIES 3

// --- MQTT Topic Names ---
#define TOPIC_MOTION_SENSORS "home/node/motion/sensors"
#define TOPIC_ACTUATOR_BUZZER "home/actuator/buzzer"
#define TOPIC_ACTUATOR_LEDS "home/actuator/leds"
#define TOPIC_AGGREGATE_FSM "home/aggregate/fsm/state"

// --- Sensor Calibration Constants ---
#define PIR_DEBOUNCE_MS 500    // Debounce window for PIR

// --- Buzzer PWM Configuration ---
#define BUZZER_LEDC_CHANNEL 0
#define BUZZER_BASE_FREQ 2000
#define BUZZER_RESOLUTION 8

// --- Buzzer Frequencies ---
#define BUZZER_FREQ_SILENT 0
#define BUZZER_FREQ_LOW 500
#define BUZZER_FREQ_MEDIUM 1000
#define BUZZER_FREQ_HIGH 2000

// --- Diagnostics & Performance ---
#define SERIAL_BAUD 115200

#define DEBUG_LOG true

#endif // CONFIG_H
