# 🏠 Smart Home IoT Safety System — Complete Demonstration Workflow

> **Project:** IoT-F2GR Smart Home Monitoring System  
> **Architecture:** 3 × ESP32 Sensor Nodes + 1 × Raspberry Pi Edge Coordinator  
> **Subject Coverage:** Discrete Mathematics (DMS) · Design & Analysis of Algorithms (DAA) · Computer Networks  

---

## 📋 Table of Contents

1. [Hardware Inventory Checklist](#1-hardware-inventory-checklist)
2. [Pre-Demo Setup (Do This Before Evaluators Arrive)](#2-pre-demo-setup-do-this-before-evaluators-arrive)
3. [Powering On — Step-by-Step](#3-powering-on--step-by-step)
4. [Starting the Raspberry Pi Coordinator](#4-starting-the-raspberry-pi-coordinator)
5. [Verifying the System is Running](#5-verifying-the-system-is-running)
6. [Collecting & Viewing Sensor Data (CSV)](#6-collecting--viewing-sensor-data-csv)
7. [Demonstrating to Evaluators](#7-demonstrating-to-evaluators)
8. [Showing the Web Dashboard](#8-showing-the-web-dashboard)
9. [Simulating Alert & Critical Scenarios](#9-simulating-alert--critical-scenarios)
10. [Graceful Shutdown](#10-graceful-shutdown)
11. [Troubleshooting Quick Reference](#11-troubleshooting-quick-reference)

---

## 1. Hardware Inventory Checklist

Before beginning, confirm all the following items are present and functional:

| # | Component | Qty | Location |
|---|-----------|-----|----------|
| ✅ | ESP32 DevKit v1 (38-pin) | 3 | Sensor nodes |
| ✅ | Raspberry Pi (3B+ or 4) | 1 | Edge coordinator |
| ✅ | DHT11 Temperature & Humidity Sensor | 1 | ESP32 #1 |
| ✅ | MQ-2 Gas / Smoke Sensor | 1 | ESP32 #1 |
| ✅ | HC-SR501 PIR Motion Sensor | 1 | ESP32 #2 |
| ✅ | Active Buzzer (5V) | 1 | ESP32 #2 |
| ✅ | LDR (GL5516) | 1 | ESP32 #3 |
| ✅ | Single LED + 220Ω Resistor | 1 | ESP32 #3 (GPIO 12) |
| ✅ | 16×2 I2C LCD Display | 1 | ESP32 #3 (SDA→D21, SCL→D22) |
| ✅ | USB Power Cables | 4 | 3× ESP32 + 1× Raspberry Pi |
| ✅ | Wi-Fi Router / Hotspot | 1 | Same subnet as all devices |
| ✅ | Laptop (for SSH into Raspberry Pi) | 1 | For evaluator demo terminal |

---

## 2. Pre-Demo Setup (Do This Before Evaluators Arrive)

### 2.1 Confirm Wi-Fi Credentials are Flashed into ESP32s

All three ESP32 firmwares use the following credentials (set in each `config.h`):

| ESP32 Node | Config File |
|------------|-------------|
| #1 — Env Sensor (DHT11 + MQ2) | `firmware/esp32_env_sensor/config.h` |
| #2 — Motion Sensor (PIR + Buzzer) | `firmware/esp32_motion_sensor/config.h` |
| #3 — Light/Status Node (LDR + LED) | `firmware/esp32_light_sensor/config.h` |

Make sure each `config.h` has the correct values:
```c
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define MQTT_BROKER_IP "192.168.1.100"   // ← Raspberry Pi's static IP
#define MQTT_PORT 1883
```

> ⚠️ If you changed the Wi-Fi network since last flashing, re-flash all 3 ESP32s using Arduino IDE before the demo.

### 2.2 Confirm Raspberry Pi Has a Static IP (192.168.1.100)

SSH into the Pi and verify:
```bash
ip addr show
```
The `wlan0` interface should show `192.168.1.100`. If not, set a static IP in `/etc/dhcpcd.conf` and reboot.

### 2.3 Confirm Mosquitto MQTT Broker is Installed & Enabled

```bash
sudo systemctl status mosquitto
```
Expected output: `Active: active (running)`

If not running:
```bash
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

### 2.4 Confirm Python Dependencies are Installed

```bash
cd /home/ayushi/main/raspberry_pi
pip3 install -r requirements.txt
```

Key packages: `paho-mqtt`, `numpy`, `pandas`, `scipy`, `scikit-learn`, `matplotlib`, `requests`

### 2.5 Confirm ThingSpeak API Keys are Configured

Open `config.json` and confirm the keys are set:
```bash
nano /home/ayushi/main/raspberry_pi/config.json
```
Check the `thingspeak` section:
```json
"thingspeak": {
    "channel_id": YOUR_CHANNEL_ID,
    "write_api_key": "YOUR_WRITE_KEY",
    "read_api_key":  "YOUR_READ_KEY"
}
```

---

## 3. Powering On — Step-by-Step

Follow this exact power-on sequence to avoid MQTT race conditions.

### Step 1 — Power on the Raspberry Pi FIRST

Connect the Pi to its USB power supply and wait ~30 seconds for it to boot fully.

> The Pi must boot first because it runs the **Mosquitto MQTT Broker**. If the ESP32s boot before the broker is ready, they will fail to connect and require a manual reset.

### Step 2 — Verify the MQTT Broker is Up

SSH into the Pi from your laptop:
```bash
ssh ayushi@192.168.1.100
```
Then check the broker:
```bash
sudo systemctl status mosquitto
```
Confirm it shows: `Active: active (running)`

### Step 3 — Power on all 3 ESP32s

Connect each ESP32 to power (USB). They will:
1. Connect to Wi-Fi (takes 5–10 seconds)
2. Connect to the Mosquitto broker at `192.168.1.100:1883`
3. Begin publishing sensor data on their respective MQTT topics every **1 second**

**Published MQTT Topics:**

| Node | Publishes To | Subscribes To |
|------|-------------|---------------|
| ESP32 #1 (Env) | `home/node/env/sensors` | `home/actuator/buzzer`, `home/actuator/led` |
| ESP32 #2 (Motion) | `home/node/motion/sensors` | `home/actuator/buzzer`, `home/aggregate/fsm/state` |
| ESP32 #3 (Light) | `home/node/light/sensors` | `home/actuator/led` |

### Step 4 — Confirm ESP32s are Connected

Back on the Pi terminal, run this to listen for any incoming MQTT messages and confirm all nodes are publishing:
```bash
mosquitto_sub -h localhost -t "home/#" -v
```
You should see a continuous stream of JSON payloads from all 3 nodes. Press `Ctrl+C` to stop listening.

---

## 4. Starting the Raspberry Pi Coordinator

Open a terminal on the Raspberry Pi (via SSH) and run:

```bash
cd /home/ayushi/main/raspberry_pi
python3 main_coordinator.py
```

Once started, the coordinator will:

1. **Initialize all edge algorithm modules** — Sensor Calibration, Sensor Fusion, FSM Engine, Graph Engine, BFS/DFS/Dijkstra Algorithms, Actuator Control, Health Monitor, ThingSpeak Client
2. **Connect to the Mosquitto broker** on `localhost:1883`
3. **Subscribe to `home/#`** — receiving all sensor data from all 3 ESP32 nodes
4. **Create the CSV dataset directory** at `./smarthome_data/datasets/` automatically
5. **Begin writing telemetry** to `smarthome_telemetry_DDMMYYYY.csv` (e.g., `smarthome_telemetry_04062026.csv`)
6. **Start the live monitoring loop** — printing a status line every 10 seconds

You will see log output like:
```
2026-06-04 10:30:01 [INFO] (MainCoordinator) Initializing Raspberry Pi Coordinator Service...
2026-06-04 10:30:01 [INFO] (MQTTSubscriber) Connected successfully to Mosquitto broker
2026-06-04 10:30:01 [INFO] (DatasetRecorder) Dataset file rotated. Active log target: ./smarthome_data/datasets/smarthome_telemetry_04062026.csv
2026-06-04 10:30:01 [INFO] (MainCoordinator) MQTT Listener threads active. Entering monitoring loop...
[Pi Live Monitor] Pkts/s: 3.00 | Latency: 12.4ms | Loss Gap count: 0
                  FSM State: IDLE | Fused Risk R=0.052
```

> 💡 **Tip for Demo:** Keep this terminal visible on screen or on a secondary monitor so evaluators can see the live log stream.

---

## 5. Verifying the System is Running

### 5.1 Check Live Console Output

The coordinator prints a status line every 10 seconds:
```
[Pi Live Monitor] Pkts/s: 3.00 | Latency: 12.4ms | Loss Gap count: 0
                  FSM State: IDLE | Fused Risk R=0.052
```

| Field | What it Means |
|-------|--------------|
| `Pkts/s` | Number of MQTT messages received per second from all nodes |
| `Latency` | Average end-to-end network latency in milliseconds (ESP32 → Pi) |
| `Loss Gap count` | Number of out-of-sequence packet arrivals (should be 0 in normal conditions) |
| `FSM State` | Current Finite State Machine state of the system |
| `Fused Risk R=` | Weighted multi-sensor risk score (0.0 = safe, 1.0 = critical hazard) |

### 5.2 FSM States Reference

The system automatically escalates through the following states based on the fused risk score `R`:

| State | Risk Score `R` | Meaning | LED | Buzzer |
|-------|---------------|---------|-----|--------|
| `IDLE` | R < 0.20 | Environment is safe | OFF | Silent |
| `MONITOR` | 0.20 ≤ R < 0.40 | Mild changes detected, monitoring | OFF | Silent |
| `ALERT_LOW` | 0.40 ≤ R < 0.65 | Low-level alert — cautious | Slow blink | 500 Hz pulse |
| `ALERT_HIGH` | 0.65 ≤ R < 0.85 | High warning — elevated hazard | Fast blink | 1000 Hz |
| `CRITICAL` | R ≥ 0.85 | Critical hazard detected | Solid ON | 2000 Hz |
| `FAULT` | Sensor failure | Sensor data invalid | ON | 1000 Hz |

### 5.3 Verify Graph Topology Updates

Every 60 seconds, the graph engine re-computes safety weights across the 5-zone home topology:

| Node Index | Zone |
|-----------|------|
| 0 | Living Room |
| 1 | Kitchen |
| 2 | Bedroom |
| 3 | Hallway |
| 4 | Exterior (Exit) |

BFS, DFS, and Dijkstra algorithms run automatically when the FSM state reaches `MONITOR` or above. The Dijkstra result gives the **safest evacuation path** from the hazard origin (Node 0) to the exit (Node 4).

---

## 6. Collecting & Viewing Sensor Data (CSV)

### 6.1 Find the CSV File

Open a **second SSH terminal** on the Pi (while the coordinator is still running in the first):
```bash
ssh ayushi@192.168.1.100
cd /home/ayushi/main/raspberry_pi
ls -lh ./smarthome_data/datasets/
```
You will see the active file:
```
smarthome_telemetry_04062026.csv
```

### 6.2 Scroll Through the CSV (Most Readable)

```bash
less -S ./smarthome_data/datasets/smarthome_telemetry_04062026.csv
```
- **Left / Right Arrow:** Scroll columns horizontally
- **Up / Down Arrow or Page Up/Down:** Scroll rows vertically
- **`q`:** Exit

### 6.3 Watch Incoming Rows in Real Time

```bash
tail -f ./smarthome_data/datasets/smarthome_telemetry_04062026.csv
```
This shows each new sensor reading as it is written. Press `Ctrl+C` to stop.

### 6.4 CSV Column Reference

| Column | Description |
|--------|-------------|
| `timestamp` | ISO 8601 timestamp of the reading |
| `temperature` | Calibrated temperature in °C |
| `humidity` | Calibrated relative humidity in % |
| `mq2_ppm` | MQ-2 gas concentration in PPM |
| `pir` | PIR motion state (1 = motion detected) |
| `ldr` | Normalized light level (0.0–1.0) |
| `risk_score` | Weighted fused risk score (0.0–1.0) |
| `fsm_state` | Human-readable FSM state name |
| `alert_flag` | 1 if a critical alert is active, 0 otherwise |
| `anomaly_label` | Manually set anomaly annotation label (0 = normal) |
| `sequence_number` | ESP32 packet sequence counter |
| `n_T` | Normalized temperature (for ML training) |
| `n_S` | Normalized gas/smoke (for ML training) |
| `n_P` | Normalized PIR state |
| `n_H` | Normalized humidity |
| `n_L` | Normalized light level |

### 6.5 File Rotation

A new CSV file is created automatically every **24 hours** to keep files manageable. Each daily file is also accompanied by a JSON summary stats file:
```
smarthome_telemetry_04062026.csv          ← today's raw telemetry
smarthome_telemetry_04062026_stats.json   ← hourly summary statistics
```

---

## 7. Demonstrating to Evaluators

### 7.1 System Architecture Walkthrough

Point evaluators to the following key components:

```
ESP32 Nodes  ──MQTT──►  Raspberry Pi (Mosquitto broker)
                              │
              ┌───────────────┼───────────────────┐
              ▼               ▼                   ▼
     Sensor Calibration   FSM Engine        Graph Engine
     + Sensor Fusion      (6 states,        (5 nodes, 6 edges,
     (Weighted Risk R)     36-entry          BFS / DFS /
                           δ-matrix)         Dijkstra)
              │               │                   │
              └───────────────┼───────────────────┘
                              ▼
                   Dataset Recorder (CSV)
                   Anomaly Detector
                   ThingSpeak Cloud Upload
                   Academic Report Generator
```

### 7.2 Key Points to Explain

**Discrete Mathematics (DMS):**
- The FSM has **6 states** and a **36-entry deterministic delta transition matrix (δ)**
- The home is modelled as a **weighted undirected graph** with 5 vertices and 6 edges
- Boolean minimization (Karnaugh Map logic) is used to evaluate alert flags from raw sensor states
- Livelock detection is implemented to prevent state oscillation at critical boundaries

**Design & Analysis of Algorithms (DAA):**
- **BFS** — Breadth-First Search propagates alarm alerts across connected zones (O(V+E))
- **DFS** — Depth-First Search performs exploratory hazard reach analysis (O(V+E))
- **Dijkstra** — Computes the minimum-cost evacuation path with dynamic edge weights (O((V+E) log V))
- All algorithm execution times are logged in **microseconds** for performance analysis

**Computer Networks:**
- **MQTT protocol** over TCP/IP at port 1883 with QoS levels 0, 1, 2 (state-dependent)
- ESP32s publish sensor data every **1 second** (`SENSOR_READ_INTERVAL_MS = 1000`)
- **ThingSpeak** integration via HTTPS GET requests with a mandatory 15-second rate limit
- Network latency, packet loss, and sequence gap metrics are tracked live

---

## 8. Showing the Web Dashboard

The project includes a web-based dashboard (React + TypeScript) built with Vite.

### 8.1 Starting the Dashboard (on your Laptop)

On your **Windows laptop** (not the Raspberry Pi), open a terminal in the project directory:
```bash
cd C:\Users\mrcas\OneDrive\Desktop\IoT-F2GR-for-Smart-Home
npm run dev
```
The dashboard will be available at:
```
http://localhost:5173
```
Open this in your browser.

### 8.2 What the Dashboard Shows

The dashboard is connected to **Firebase** and **ThingSpeak** for live data visualization. It shows:
- Live sensor readings (temperature, humidity, gas PPM, motion, light)
- Current FSM state with visual indicators
- Risk score gauge
- Historical trend charts for all sensor channels
- Alert/critical event history

### 8.3 Pointing ThingSpeak Channel to Evaluators

Navigate to your ThingSpeak channel in a browser:
```
https://thingspeak.com/channels/YOUR_CHANNEL_ID
```

The dashboard displays the following ThingSpeak fields:

| Field | Sensor / Metric |
|-------|----------------|
| Field 1 | Temperature (°C) |
| Field 2 | Humidity (%) |
| Field 3 | Gas PPM (MQ-2) |
| Field 4 | PIR Motion State |
| Field 5 | LDR Light Level |
| Field 6 | Fused Risk Score |
| Field 7 | FSM State (integer) |
| Field 8 | Critical Alert Flag (0/1) |

> ThingSpeak updates every **15 seconds** due to the enforced API rate limit.

---

## 9. Simulating Alert & Critical Scenarios

> Use these scenarios to demonstrate system responses in real time for the evaluators.

### Scenario A — Normal Operation (IDLE / MONITOR State)

Leave all sensors undisturbed. The system should report:
- `FSM State: IDLE`, Risk `R < 0.20`
- LED: OFF, Buzzer: Silent
- CSV writing normally

### Scenario B — Gas Alert (ALERT_LOW → ALERT_HIGH State)

Hold a lit match or lighter **briefly** near the MQ-2 sensor on ESP32 #1. The system should:
1. Detect elevated PPM reading
2. Increase the fused risk score `R`
3. Transition FSM: `IDLE → MONITOR → ALERT_LOW → ALERT_HIGH`
4. LED on ESP32 #3 starts blinking
5. Buzzer on ESP32 #2 activates at 1000 Hz
6. CSV row shows `fsm_state: ALERT_HIGH`, `alert_flag: 0`

> ⚠️ Safety: Use only briefly and in a well-ventilated area.

### Scenario C — Motion + Heat (CRITICAL State)

Simultaneously:
- Wave your hand in front of the PIR sensor on ESP32 #2
- Breathe warm air onto the DHT11 sensor on ESP32 #1

The multi-sensor fusion combines the elevated temperature + motion to push `R ≥ 0.85`:
1. FSM transitions to `CRITICAL`
2. LED on ESP32 #3 turns solid ON
3. Buzzer sounds at 2000 Hz
4. CSV row: `fsm_state: CRITICAL`, `alert_flag: 1`
5. Dijkstra graph algorithm computes and logs the safest evacuation path

### Scenario D — Sensor Fault (FAULT State)

Disconnect the DHT11 jumper wire from ESP32 #1. The health monitor detects an out-of-range reading and flags a sensor fault:
1. FSM transitions to `FAULT`
2. Console log shows: `[Health Monitor] Sensor fault detected`
3. Feedback controller sends HTTP request to ESP32 (`/feedback` endpoint)

Reconnect the wire to recover — the FSM will return to `IDLE` once readings normalize.

---

## 10. Graceful Shutdown

When the demonstration is complete:

### Step 1 — Stop the Coordinator (on Raspberry Pi)

In the terminal running `main_coordinator.py`, press:
```
Ctrl + C
```

The coordinator will:
1. Disconnect from the MQTT broker cleanly
2. Compute final hourly dataset statistics and save them to `_stats.json`
3. Compile and save the **Academic Markdown Report** to:
   ```
   ./smarthome_data/reports/report_academic_DDMMYYYY_HHMMSS.md
   ```
4. Print `Service Offline.` in the log

### Step 2 — Stop the Dashboard

In the Windows terminal running `npm run dev`, press:
```
Ctrl + C
```

### Step 3 — Power Off Devices (in Reverse Order)

1. Power off all 3 ESP32s first
2. Safely shut down the Raspberry Pi:
   ```bash
   sudo shutdown now
   ```
3. Disconnect the Pi power supply once it powers off

---

## 11. Troubleshooting Quick Reference

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| ESP32 not connecting to Wi-Fi | Wrong SSID/password in `config.h` | Re-flash with correct credentials |
| `MQTT Connection failed with code 5` | Auth / wrong broker IP | Confirm `MQTT_BROKER_IP` in `config.h` matches Pi's IP |
| No data in CSV file | Coordinator not receiving MQTT messages | Run `mosquitto_sub -h localhost -t "home/#" -v` to check if nodes are publishing |
| `No such directory` for datasets | Coordinator has never been run | Run `python3 main_coordinator.py` once; directory is created automatically |
| ThingSpeak shows 0 updates | API key not set in `config.json` | Add correct `write_api_key` to `config.json` |
| Dashboard not loading | `npm run dev` not started | Run `npm run dev` in the project root on your laptop |
| FSM stuck in FAULT state | Sensor reading out of range | Check physical sensor connections; reconnect loose jumper wires |
| Pi cannot be SSH'd into | Pi not on network | Check Wi-Fi connection; verify IP with `ip addr show` on Pi monitor |
| Buzzer not sounding | Wrong GPIO or loose connection | Confirm BUZZER_PIN is D1 (ESP32 #2) and connection is solid |
| LED not turning on | Wrong GPIO or logic | Confirm `SINGLE_LED_PIN` is D12 (ESP32 #3, `config.h` line 9) |

---

*Demonstration workflow document generated for the IoT-F2GR Smart Home Monitoring System.*  
*For hardware wiring reference, see [CIRCUIT_CONNECTIONS.md](./CIRCUIT_CONNECTIONS.md).*
