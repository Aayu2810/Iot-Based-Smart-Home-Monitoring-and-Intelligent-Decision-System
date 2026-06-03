# Implementation Guide

## 1. Overview
The Smart Home Monitoring System is built as a **distributed architecture** with **three ESP32‑WROOM‑32 nodes** and a Raspberry Pi edge coordinator. The nodes communicate over Wi‑Fi using **MQTT**. A single LCD (16×2 I2C) is integrated into the **light/status node (ESP32 #3)** to display temperature, humidity, motion, and light level data in a scrolling fashion.

## 2. Hardware Summary
| Node | Purpose | Sensors / Actuators | Physical Pin Assignments (ESP32‑WROOM‑32) |
|------|---------|---------------------|------------------------------------------|
| **ESP32 #1** | Environmental sensing | DHT11 (Temp/Humidity) – data pin **Pin 4**<br>MQ‑2 (Gas) – analog output **Pin 34** (ADC1_CH7) | D0 → Pin 4 (DHT11)<br>D1 → Pin 34 (MQ‑2) |
| **ESP32 #2** | Motion detection | PIR – output **Pin 27**<br>Buzzer – PWM **Pin 13** (LEDC channel 0) | D0 → Pin 27 (PIR)<br>D1 → Pin 13 (Buzzer) |
| **ESP32 #3** (Light & LCD) | Light sensing & status display | LDR – analog **Pin 35** (ADC1_CH7)<br>Single Status LED – **Pin 12** (physical)<br>16×2 I2C LCD – SDA **Pin 21**, SCL **Pin 22** | D0 → Pin 35 (LDR)<br>LED_PHYSICAL_PIN → Pin 12 (LED)<br>SDA → Pin 21 (LCD)<br>SCL → Pin 22 (LCD) |
| **Raspberry Pi** | Edge broker, FSM, ThingSpeak gateway | – | – |

All nodes share a common **5 V USB power supply** and are grounded together.

## 3. Wiring Diagram (textual)
```
+---------------------------+      Wi‑Fi (MQTT)      +---------------------------+
| ESP32 #1 (Env)            | --------------------> | Raspberry Pi (Broker)    |
|  Pin 4  ← DHT11 DATA      |                       |                         |
|  Pin 34 ← MQ‑2 ANALOG     |                       +---------------------------+
+---------------------------+                               |
                                                            |
+---------------------------+      Wi‑Fi (MQTT)           |
| ESP32 #2 (Motion)         | ---------------------------+
|  Pin 27 ← PIR OUT          |
|  Pin 13 ← Buzzer PWM      |
+---------------------------+                               |
                                                            |
+---------------------------+      Wi‑Fi (MQTT)           |
| ESP32 #3 (Light & LCD)    | ---------------------------+
|  Pin 35 ← LDR ANALOG       |
|  Pin 12 ← STATUS LED      |
|  SDA  ← Pin 21            |
|  SCL  ← Pin 22            |
+---------------------------+                               |
```

## 4. Firmware Structure
```
firmware/
├─ esp32_env_sensor/
│   ├─ main.ino
│   └─ config.h
├─ esp32_motion_sensor/
│   ├─ main.ino
│   └─ config.h
└─ esp32_light_lcd/
    ├─ main.ino   // Handles LDR, LED and LCD display
    └─ config.h   // Defines pins and LCD parameters
```
All nodes use the **same helper libraries** (`PubSubClient`, `ArduinoJson`, `LiquidCrystal_I2C`) and share `mqtt_client.cpp/h` for connection handling.

## 5. MQTT Topic Map
| Direction | Topic | Payload Example |
|-----------|-------|----------------|
| Env → Pi | `home/node/env/sensors` | `{ "temperature":23.5, "humidity":55, "gas":120 }` |
| Motion → Pi | `home/node/motion/sensors` | `{ "motion":true }` |
| Light → Pi | `home/node/light/sensors` | `{ "ldr_raw":1320, "ldr_norm":0.32 }` |
| LCD UI ← Pi | Subscribes to the three topics above, builds a composite JSON, and displays it. |

## 6. Light & LCD Node (ESP32 #3) – Key Code Highlights
```cpp
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLUMNS, LCD_ROWS);

// MQTT callback parses temperature, humidity, motion and stores them globally.
void mqttCallback(char* topic, byte* payload, unsigned int len) {
    // parse JSON into envTemp, envHum, motionDetected
}

void loop() {
    // maintain MQTT connection
    // every 2 s build a line: "T:23.5C H:55% M:YES LDR:1320"
    // scroll the line on the 16‑char display
}
```
The node **does not publish**; it solely subscribes and renders the data.

## 7. Build & Flash Procedure
1. Install **Arduino IDE 2.x** or **PlatformIO**.
2. Add the ESP32 board URL `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`.
3. Install libraries via Library Manager:
   - PubSubClient
   - ArduinoJson
   - LiquidCrystal_I2C
4. Open each node’s `main.ino`, select **ESP32 Dev Module**, and click **Upload**.
5. On the Raspberry Pi, install Mosquitto:
   ```bash
   sudo apt update && sudo apt install -y mosquitto mosquitto-clients
   sudo systemctl enable mosquitto && sudo systemctl start mosquitto
   ```
6. Run the provided `thingspeak_client.py` (in `raspberry_pi/`) to forward aggregated data to ThingSpeak.

## 8. Testing & Validation
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Wi‑Fi | Open Serial Monitor after reset | `Connected, IP: 192.168.1.x` |
| MQTT Publish (Env) | Observe `mosquitto_sub -t home/node/env/sensors` | JSON payload with temperature/humidity/gas |
| Motion Alarm | Trigger PIR sensor | Buzzer beeps, MQTT payload `motion:true` |
| Light Reading | Cover/uncover LDR | LDR raw value changes, LCD updates the numeric field |
| LCD Scrolling | Power on ESP32 #3 | Text scrolls continuously showing all sensor values |

## 9. Troubleshooting Checklist
- **No Wi‑Fi**: Verify SSID/password in every node’s `config.h`.
- **MQTT connection fails**: Check `MQTT_BROKER_IP` (must be Pi’s IP) and firewall settings.
- **LCD shows nothing**: Confirm I2C address (`0x27` or `0x3F`). Run an I2C scanner sketch to detect the correct address.
- **LED not lighting**: Ensure `LED_PHYSICAL_PIN` matches the physical pin used on the board (Pin 12 in this implementation).
- **ADC values stuck**: Verify voltage divider wiring; LDR must be connected between VCC and the ADC pin with a pull‑down resistor.

## 10. Future Enhancements
- Add **OTA updates** for all ESP32 nodes.
- Replace the character LCD with a **color TFT** for richer UI.
- Secure MQTT with TLS certificates.
- Implement **state‑ful FSM** on the Pi to trigger alerts based on combined sensor thresholds.
- Integrate **machine‑learning anomaly detection** on the Pi for gas spikes.

---
*Implementation guide generated on 2026‑06‑03.*
## 1. Overview
The Smart Home Monitoring System is built as a **distributed architecture** with four ESP32‑WROOM‑32 nodes and a Raspberry Pi edge coordinator. The nodes communicate over Wi‑Fi using **MQTT**. A dedicated LCD node displays temperature, humidity, motion, and light level data in a scrolling fashion.

## 2. Hardware Summary
| Node | Purpose | Sensors / Actuators | Physical Pin Assignments (ESP32‑WROOM‑32) |
|------|---------|---------------------|------------------------------------------|
| **ESP32 #1** | Environmental sensing | DHT11 (Temp/Humidity) – data pin **Pin 4**<br>MQ‑2 (Gas) – analog output **Pin 34** (ADC1_CH7) | D0 → Pin 4 (DHT11)<br>D1 → Pin 34 (MQ‑2) |
| **ESP32 #2** | Motion detection | PIR – output **Pin 27**<br>Buzzer – PWM **Pin 13** (LEDC channel 0) | D0 → Pin 27 (PIR)<br>D1 → Pin 13 (Buzzer) |
| **ESP32 #3** | Light sensing & status | LDR – analog **Pin 35** (ADC1_CH7)<br>Single Status LED – **Pin 33** (physical) | D0 → Pin 35 (LDR)<br>LED_PHYSICAL_PIN → Pin 33 (LED) |
| **ESP32 #4** | LCD UI | 16×2 I2C LCD (PCF8574 backpack) | SDA → Pin 21<br>SCL → Pin 22 |
| **Raspberry Pi** | Edge broker, FSM, ThingSpeak gateway | – | – |

All nodes share a common **5 V USB power supply** and are grounded together.

## 3. Wiring Diagram (textual)
```
+---------------------------+      Wi‑Fi (MQTT)      +---------------------------+
| ESP32 #1 (Env)            | --------------------> | Raspberry Pi (Broker)    |
|  Pin 4  ← DHT11 DATA      |                       |                         |
|  Pin 34 ← MQ‑2 ANALOG     |                       +---------------------------+
+---------------------------+                               |
                                                            |
+---------------------------+      Wi‑Fi (MQTT)           |
| ESP32 #2 (Motion)         | ---------------------------+
|  Pin 27 ← PIR OUT          |
|  Pin 13 ← Buzzer PWM      |
+---------------------------+                               |
                                                            |
+---------------------------+      Wi‑Fi (MQTT)           |
| ESP32 #3 (Light)          | ---------------------------+
|  Pin 35 ← LDR ANALOG       |
|  Pin 33 ← STATUS LED      |
+---------------------------+                               |
                                                            |
+---------------------------+      Wi‑Fi (MQTT)           |
| ESP32 #4 (LCD UI)         | ---------------------------+
|  SDA  ← Pin 21            |
|  SCL  ← Pin 22            |
+---------------------------+                               |
```

## 4. Firmware Structure
```
firmware/
├─ esp32_env_sensor/
│   ├─ main.ino
│   └─ config.h
├─ esp32_motion_sensor/
│   ├─ main.ino
│   └─ config.h
├─ esp32_light_sensor/
│   ├─ main.ino   (LED removed, LCD handling added)
│   └─ config.h   (LED_PHYSICAL_PIN defined)
└─ esp32_lcd_display/
    ├─ main.ino   (LCD scrolling implementation)
    └─ config.h   (I2C pins, LCD address)
```
All nodes use the **same helper libraries** (`PubSubClient`, `ArduinoJson`) and share `mqtt_client.cpp/h` for connection handling.

## 5. MQTT Topic Map
| Direction | Topic | Payload Example |
|-----------|-------|----------------|
| Env → Pi | `home/node/env/sensors` | `{ "temperature":23.5, "humidity":55, "gas":120 }` |
| Motion → Pi | `home/node/motion/sensors` | `{ "motion":true }` |
| Light → Pi | `home/node/light/sensors` | `{ "ldr_raw":1320, "ldr_norm":0.32 }` |
| LCD UI ← Pi | Subscribes to the three topics above, builds a composite JSON, and displays it. |

## 6. LCD Display Node (ESP32 #4) – Key Code Highlights
```cpp
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "config.h"

LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLUMNS, LCD_ROWS);

// MQTT callback parses temperature, humidity, motion and stores them globally.
void mqttCallback(char* topic, byte* payload, unsigned int len) {
    // parse JSON into envTemp, envHum, motionDetected
}

void loop() {
    // maintain MQTT connection
    // every 2 s build a line: "T:23.5C H:55% M:YES LDR:1320"
    // scroll the line on the 16‑char display
}
```
The LCD node **does not publish**; it solely subscribes and renders.

## 7. Build & Flash Procedure
1. Install **Arduino IDE 2.x** or **PlatformIO**.
2. Add the ESP32 board URL `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`.
3. Install libraries via Library Manager:
   - PubSubClient
   - ArduinoJson
   - LiquidCrystal_I2C
4. Open each node’s `main.ino`, select **ESP32 Dev Module**, and click **Upload**.
5. On the Raspberry Pi, install Mosquitto:
   ```bash
   sudo apt update && sudo apt install -y mosquitto mosquitto-clients
   sudo systemctl enable mosquitto && sudo systemctl start mosquitto
   ```
6. Run the provided `thingspeak_client.py` (in `raspberry_pi/`) to forward aggregated data to ThingSpeak.

## 8. Testing & Validation
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Wi‑Fi | Open Serial Monitor after reset | `Connected, IP: 192.168.1.x` |
| MQTT Publish (Env) | Observe `mosquitto_sub -t home/node/env/sensors` | JSON payload with temperature/humidity/gas |
| Motion Alarm | Trigger PIR sensor | Buzzer beeps, MQTT payload `motion:true` |
| Light Reading | Cover/uncover LDR | LDR raw value changes, LCD updates the numeric field |
| LCD Scrolling | Power on ESP32 #4 | Text scrolls continuously showing all sensor values |

## 9. Troubleshooting Checklist
- **No Wi‑Fi**: Verify SSID/password in every node’s `config.h`.
- **MQTT connection fails**: Check `MQTT_BROKER_IP` (must be Pi’s IP) and firewall settings.
- **LCD shows nothing**: Confirm I2C address (`0x27` or `0x3F`). Run an I2C scanner sketch to detect the correct address.
- **LED not lighting**: Ensure `LED_PHYSICAL_PIN` matches the physical pin used on the board (Pin 33 in this implementation).
- **ADC values stuck**: Verify voltage divider wiring; LDR must be connected between VCC and the ADC pin with a pull‑down resistor.

## 10. Future Enhancements
- Add **OTA updates** for all ESP32 nodes.
- Replace the character LCD with a **color TFT** for richer UI.
- Secure MQTT with TLS certificates.
- Implement **state‑ful FSM** on the Pi to trigger alerts based on combined sensor thresholds.
- Integrate **machine‑learning anomaly detection** on the Pi for gas spikes.

---
*Implementation guide generated on 2026‑06‑03.*
