# Smart Home IoT Cognitive Backplane - LLM Context Document

## 1. Project Overview
This project is an advanced, algorithm-driven Smart Home Monitoring System. It goes beyond simple threshold-based alerts by employing a localized **Edge Coordinator (Raspberry Pi)** to perform sensor fusion, state machine management, and graph-theoretic pathfinding. The system aggregates real-time telemetry from distributed **ESP32 Edge Nodes** via **MQTT**, processes it to determine hazard levels, and displays dynamic visualizations (including algorithmic data) on a **React/Vite Frontend Dashboard**.

## 2. System Architecture

The architecture consists of three distinct layers communicating via a local MQTT broker:

### A. Perception Layer (Firmware - ESP32 Nodes)
*   **Location**: `firmware/`
*   **Tech Stack**: C++ / Arduino IDE
*   **Hardware**: 3x ESP32 microcontrollers distributed across specific zones (Kitchen, Main Door, Bedroom).
*   **Sensors**: DHT11 (Temperature & Humidity), MQ-2 (Smoke/Gas), PIR (Motion), LDR (Ambient Light).
*   **Actuators**: Piezo Buzzers, Warning LEDs.
*   **Role**: Reads physical environment variables, debounces/filters inputs, and publishes raw JSON telemetry to the MQTT broker. Subscribes to actuator command topics to trigger physical alerts.

### B. Cognitive / Edge Coordinator Layer (Raspberry Pi)
*   **Location**: `raspberry_pi/`
*   **Tech Stack**: Python
*   **Role**: Acts as the central intelligence of the smart home. It subscribes to sensor telemetry, runs mathematical algorithms locally, and publishes state decisions and pathfinding results back to the MQTT broker.
*   **Key Algorithms (`raspberry_pi/edge_algorithms/`)**:
    *   **Sensor Fusion (`sensor_fusion.py`)**: Normalizes raw sensor inputs and calculates a combined, weighted **Risk Score ($R$)** ($0.0$ to $1.0$). Weights prioritize gas/smoke ($35\%$) and temperature ($30\%$).
    *   **Deterministic FSM (`fsm_engine.py`)**: A 6-state (IDLE, MONITOR, ALERT_LOW, ALERT_HIGH, CRITICAL, FAULT) finite state machine. It transitions based on the continuous Risk Score mapped to discrete $\Sigma$ input symbols. Includes livelock defense mechanisms.
    *   **Dijkstra's Algorithm (`dijkstra_algorithm.py`)**: A hazard-aware dynamic pathfinder. Instead of finding the shortest physical path, it calculates traversal weights dynamically using the active risk scores of adjacent zones, plotting the safest evacuation route.
    *   **BFS (`bfs_algorithm.py`)**: Models outward hazard propagation. Calculates hop-distances from a danger source to modulate graduated warning alerts (e.g., 0 hops = RED alert, 1 hop = ORANGE alert).
    *   **DFS (`dfs_algorithm.py`)**: Detects cycle traps (topological back-edges) in the house layout where toxic gas might circulate. Also computes topological evacuation sequencing based on finish times.
    *   **Boolean Logic (`boolean_minimized.py`)**: Evaluates specific discrete hazard scenarios (Fire, Gas Leak, Intrusion) using boolean algebra.

### C. Presentation Layer (Frontend Web Dashboard)
*   **Location**: `src/` (root Vite project)
*   **Tech Stack**: React 18, TypeScript, Vite, Tailwind CSS, Zustand (State Management), Framer Motion (Animations), Recharts, MQTT.js.
*   **Role**: Connects to the MQTT broker via WebSockets to provide a beautiful, real-time, glassmorphic UI.
*   **Key Features**:
    *   **Analytics Tab**: Displays real-time sensor gauges, historical charts (Recharts), system health, and an active alert log.
    *   **Visualization Tab**:
        *   **Dijkstra Pathfinder (`DijkstraViz.tsx`)**: Renders an interactive node-link graph of the house. Nodes change color based on risk. Safest path is animated in green. BFS propagation order is overlaid as blue badges.
        *   **Discrete Math (`DiscreteMathViz.tsx`)**: Visualizes the active state on an FSM diagram, shows the transition table with the active column highlighted, and evaluates truth tables for boolean logic based on live sensor data.

## 3. Communication Protocol (MQTT)
All layers interact entirely through an MQTT broker.
*   **Sensor Topic**: `home/node/env/sensors` (ESP32 -> Broker -> RPi)
*   **Normalized Topic**: `home/node/env/normalized` (RPi -> Broker -> Frontend)
*   **FSM State Topic**: `home/fsm/state` (RPi -> Broker -> Frontend & ESP32)
*   **Graph/Path Topics**: `home/evacuation/path`, `home/graph/weights` (RPi -> Broker -> Frontend)
*   **Actuator Topics**: `home/actuator/buzzer`, `home/actuator/leds` (RPi -> Broker -> ESP32)

## 4. Key Developer Context
*   **Design Aesthetic**: The frontend strictly adheres to a premium, glassmorphic design utilizing a sap-green and slightly off-white color palette. It relies on `framer-motion` for smooth micro-animations.
*   **Data Flow Paradigm**: The frontend does *not* compute the Dijkstra paths or FSM states. It acts purely as a terminal that reads the computed results directly from the `useMQTT.ts` hook into a `Zustand` store (`dashboardStore.ts`), ensuring the Raspberry Pi remains the single source of truth for the cognitive backplane.
