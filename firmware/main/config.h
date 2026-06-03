/**
 * =========================================================================
 * Smart Home Monitoring System — Gateway Configuration Library (config.h)
 * =========================================================================
 * Pin mappings, thresholds, network parameters, and analytical weight vectors.
 * Dedicated to the modular academic design mapping to DMS, DAA, and Networks.
 * =========================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

// --- Hardware GPIO Configurations ---
#define DHT11_DATA_PIN 4
#define PIR_PIN 27
#define MQ2_ADC_PIN 34
#define LDR_ADC_PIN 35
#define BUZZER_PIN 13

#define RED_LED_PIN 25
#define ORANGE_LED_PIN 26
#define YELLOW_LED_PIN 33
#define GREEN_LED_PIN 32
#define BLUE_LED_PIN 14

// --- WiFi Credentials & Server Targets ---
#define WIFI_SSID "Oppo"
#define WIFI_PASSWORD "00000000"
#define WIFI_TIMEOUT_MS 10000

#define THINGSPEAK_SERVER "api.thingspeak.com"
#define THINGSPEAK_PORT 443
#define THINGSPEAK_CHANNEL_ID 000000          // Replace with actual channel ID
#define THINGSPEAK_WRITE_API_KEY "YOUR_KEY_HERE"

#define MQTT_BROKER_IP "172.18.163.168"
#define MQTT_PORT 1883
#define MQTT_CLIENT_ID "SmartHome_ESP32"
#define MQTT_MAX_RETRIES 3

// --- MQTT Topic Names (8 core channels) ---
#define TOPIC_SENSORS_RAW   "home/sensors/raw"
#define TOPIC_SENSORS_NORM  "home/sensors/normalized"
#define TOPIC_FSM_STATE     "home/fsm/state"
#define TOPIC_ALERT_CRIT    "home/alerts/critical"
#define TOPIC_GRAPH_WEIGHTS "home/graph/weights"
#define TOPIC_EVAC_PATH     "home/evacuation/path"
#define TOPIC_PERFORMANCE   "home/performance/report"
#define TOPIC_FEEDBACK_ACK  "home/ack/feedback"

// --- Formal State Machine Thresholds (Sigma Inputs) ---
#define THRESH_SIGMA0 0.20f   // Safe boundary
#define THRESH_SIGMA1 0.40f   // Monitor state
#define THRESH_SIGMA2 0.65f   // Low alert
#define THRESH_SIGMA3 0.85f   // High alert
#define T_MAX_LIVELOCK 10     // Jitter defense loops before CRITICAL push

// --- Weighted Risk Fusion Coefficients (Subject: DMS) ---
#define W_T 0.30f             // Temperature weight coefficient
#define W_S 0.35f             // Smoke/Gas ppm weight coefficient
#define W_P 0.20f             // PIR motion weight coefficient
#define W_H 0.10f             // Desorption/Dry-humidity weight coefficient
#define W_L 0.05f             // Darkness/Ambient light weight coefficient

// --- Dynamic Route Safety Weights (Subject: DAA) ---
#define ALPHA 0.50f           // Influence of safety risk score R_bar
#define BETA 0.20f            // Influence of physical route distance d_ij
#define GAMMA_PROP 0.30f      // Probability scalar for transition hops
#define LAMBDA 2.5f           // Spatial exponent parameter
#define EPSILON 0.01f         // Prevents division singularities

// --- Physical Sensor Constants ---
#define TEMP_OFFSET 0.82f      // Calibration delta
#define MQ2_A 574.25f          // Scaling coefficient
#define MQ2_B -2.222f          // Power regression scaling exponent
#define MQ2_WARMUP_MS 20000    // Warmup period (millis)

// --- Diagnostics & Performance ---
#define PERF_BUFFER_SIZE 50
#define MAX_PQ_SIZE 20
#define NUM_ZONES 5
#define NUM_EDGES 6
#define HEALTH_CHECK_INTERVAL_MS 30000
#define W_CHECK_STABLE_COUNT 10
#define WDT_TIMEOUT_S 30
#define SERIAL_BAUD 115200

#define TEST_MODE false
#define DEBUG_LOG true

#endif // CONFIG_H
