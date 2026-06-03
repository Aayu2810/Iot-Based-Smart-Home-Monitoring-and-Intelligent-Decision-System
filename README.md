
# 🏠 Smart Home Monitoring System — Complete Circuit Connection Reference

> **Project:** Smart Home IoT Cognitive Backplane  
> **Architecture:** 3 × Distributed ESP32 Sensor Nodes + 1 × Raspberry Pi Edge Coordinator  
> **Firmware source:** [`firmware/`](./firmware/) | **Pi source:** [`raspberry_pi/`](./raspberry_pi/)

---

## 1. System Architecture Overview

<img width="1024" height="559" alt="a579c03b-e7f5-495f-b603-1f536c4d8e46" src="https://github.com/user-attachments/assets/82cacd1e-5992-4c10-92b5-5daa7c1bb2c8" />


## 2. Component Inventory

| # | Component | Model / Type | Quantity | Connected To |
|---|-----------|--------------|----------|--------------|
| 1 | Microcontroller | ESP32 (38‑pin DevKit) | 3 | Distributed sensor nodes |
| 2 | Single‑board Computer | Raspberry Pi (3B+ / 4) | 1 | Edge coordinator |
| 3 | Temperature & Humidity Sensor | DHT11 | 1 | ESP32 #1 GPIO 4 |
| 4 | Gas / Smoke Sensor | MQ‑2 | 1 | ESP32 #1 GPIO 34 |
| 5 | PIR Motion Sensor | HC‑SR501 | 1 | ESP32 #2 GPIO 27 |
| 6 | Active Buzzer | 5 V Active Piezo Buzzer | 1 | ESP32 #2 GPIO 13 |
| 7 | Light Dependent Resistor | LDR (GL5516) | 1 | ESP32 #3 GPIO 35 |
| 8 | LCD (16x2 I2C) | I2C 16x2 character LCD | 1 | ESP32 #3 SDA → D21, SCL → D22 |

| 9 | Resistors (various) | See detailed list | 15 | Various |
|10 | Power Supply | 5 V USB / regulated | 4 | 3 × ESP32 + 1 × Raspberry Pi |
|11 | Breadboard / PCB | Full‑size breadboard | 3 | One per ESP32 |
|12 | Jumper Wires | Male‑to‑Male / Male‑to‑Female | ~50 | Various |

---

## 3. ESP32 #1 – Environmental Sensor Node (MQ2 + DHT11)

- **Firmware:** `firmware/esp32_env_sensor/main.ino`
- **Config:** `firmware/esp32_env_sensor/config.h`
- **Pin Mapping**
  - DHT11_DATA_PIN → D0
  - MQ2_ADC_PIN → D1 (ADC‑only)
- **MQTT Topics**
  - Publish: `home/node/env/sensors`
  - Subscribe: `home/actuator/buzzer`, `home/actuator/leds`

---

## 4. ESP32 #2 – Motion Detection Node (PIR + Buzzer)

- **Firmware:** `firmware/esp32_motion_sensor/main.ino`
- **Config:** `firmware/esp32_motion_sensor/config.h`
- **Pin Mapping**
  - PIR_PIN → D0
  - BUZZER_PIN → D1 (PWM via LEDC)
- **MQTT Topics**
  - Publish: `home/node/motion/sensors`
  - Subscribe: `home/actuator/buzzer`, `home/aggregate/fsm/state`

---

## 5. ESP32 #3 – Light & Status Node (LDR + LEDs)

- **Firmware:** `firmware/esp32_light_sensor/main.ino`
- **Config:** `firmware/esp32_light_sensor/config.h`
- **Pin Mapping**
  - LDR_ADC_PIN → D33 (ADC‑only)
  - SINGLE_LED_PIN → D12
  - UNUSED_PIN → D13 (reserved)
- **MQTT Topics**
  - Publish: `home/node/light/sensors`
  - Subscribe: `home/actuator/led`

---

## 6. Raspberry Pi – Edge Coordinator & Cloud Gateway

- **Role:** Runs Mosquitto MQTT broker (localhost:1883), aggregates sensor data, executes FSM, anomaly detection, graph algorithms, and uploads aggregated data to ThingSpeak (`api.thingspeak.com`).

---

## 7. Inter‑Device Network Topology

Refer to the original `CIRCUIT_CONNECTIONS.md` section 7 for the full MQTT topic map and wiring diagrams.

---


