/**
 * =========================================================================
 * Smart Home Monitoring System — Master Firmware (main.ino)
 * =========================================================================
 * Formally combines all algorithms, sensors, networks, and controllers
 * into a single unified event-driven execution thread with watchdog safety.
 * =========================================================================
 */

#include <Arduino.h>
#include <DHT.h>
#include <EEPROM.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "sensor_calibration.h"
#include "sensor_fusion.h"
#include "fsm_engine.h"
#include "graph_engine.h"
#include "bfs_algorithm.h"
#include "dfs_algorithm.h"
#include "dijkstra_algorithm.h"
#include "boolean_minimized.h"
#include "priority_queue.h"
#include "actuator_control.h"
#include "mqtt_client.h"
#include "thingspeak_client.h"
#include "health_monitor.h"
#include "performance_logger.h"

// --- Global Registers & State Flags ---
bool force_alert_escalation = false;
bool test_mode_active = false;
float test_sensor_values[5] = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f};

// --- Execution Shared Registries ---
SensorReadings current_readings;
NormalizedValues current_norm;
BFSResult current_bfs;
DFSResult current_dfs;
DijkstraResult current_dijkstra;
AlertFlags current_alerts;
BinaryStates current_binary;

unsigned long last_sensor_read_ms = 0;
unsigned long last_health_check_ms = 0;
unsigned long last_performance_report_ms = 0;
unsigned long cycle_start_ms = 0;

// --- Subsystem Class Instances ---
DHT dht11_sensor(DHT11_DATA_PIN, DHT11);
SensorCalibration calibration;
SensorFusion fusion;
FSMEngine fsm;
GraphEngine graph;
BFSAlgorithm bfs;
DFSAlgorithm dfs_algo;
DijkstraAlgorithm dijkstra;
ActuatorControl actuators;
MQTTClient mqtt_client;
ThingSpeakClient thingspeak;
HealthMonitor health_monitor;
PerformanceLogger perf_logger;
WebServer feedback_server(80);

void handleFeedbackPOST();
void readAllSensors();
void runComputationPipeline();
void handleNetworking();

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(100);
  Serial.println("\n\n#########################################################");
  Serial.println("  INIT: SMART HOME IoT COGNITIVE BACKPLANE BOOTING...");
  Serial.println("#########################################################");

  // EEPROM storage bounds
  EEPROM.begin(64);
  calibration.initialize();

  // Actuators
  actuators.initialize();
  actuators.allOff();

  // Sensors
  dht11_sensor.begin();
  calibration.warmupMQ2();

  // WiFi Connectivity
  Serial.printf("[WiFi] Attaching station transceiver target SSID: %s...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long wifi_start_ms = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifi_start_ms < WIFI_TIMEOUT_MS)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] STATION LEASE CONFIRMED. Local IP address: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WiFi] STATION LEASE FAILED. Continuing operations in offline mode.");
  }

  // HTTP Feedback controller Endpoint config (Subject: Networks Control Loop)
  feedback_server.on("/feedback", HTTP_POST, handleFeedbackPOST);
  feedback_server.begin();
  Serial.println("[HTTP] Local escape feedback web controller listening on port 80.");

  // MQTT
  mqtt_client.initialize(MQTT_BROKER_IP, MQTT_PORT);
  mqtt_client.connect();

  // ThingSpeak
  thingspeak.initialize();

  // Graph Properties auditing on screen (Subject: DAA Topological check)
  graph.initialize();
  graph.printGraphProperties();

  // FSM formal integrity assertions check (Subject: DMS Auto states validation)
  fsm.initialize();
  fsm.verifyProperties();

  // Medical status check systems
  health_monitor.initialize();
  perf_logger.initialize();

  // Watchdog safety backup register
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);

  Serial.println("[INIT] ALL COGNITIVE EDGE SUBSYSTEMS ONLINE.");
  Serial.println("#########################################################\n");
}

void handleFeedbackPOST() {
  if (feedback_server.hasArg("plain") == false) {
    feedback_server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing plain body\"}");
    return;
  }
  
  String body = feedback_server.arg("plain");
  Serial.printf("[HTTP Feedback Rx] Trigger payload body: %s\n", body.c_str());

  if (body.indexOf("ESCALATE") != -1) {
    force_alert_escalation = true;
    feedback_server.send(200, "application/json", "{\"status\":\"acknowledged\",\"action\":\"forcing_escalation\"}");
  } else {
    feedback_server.send(400, "application/json", "{\"status\":\"rejected\",\"message\":\"Unknown command parameter\"}");
  }
}

void readAllSensors() {
  unsigned long start_read_us = micros();

  if (TEST_MODE || test_mode_active) {
    // Inject custom software-generated values from MQTT controller commands
    current_readings.raw_temp = test_sensor_values[0];
    current_readings.raw_humidity = test_sensor_values[1];
    
    // Scale reverse conversions of ADC entries from calibrated states
    current_readings.adc_mq2 = (int)((test_sensor_values[2] / MQ2_A) * 4095.0f); // Reversing scaling
    current_readings.pir_raw = (int)test_sensor_values[3];
    current_readings.adc_ldr = (int)(test_sensor_values[4] * 4095.0f);
  } else {
    // Hardware reading extraction
    float t = dht11_sensor.readTemperature();
    float h = dht11_sensor.readHumidity();

    if (!isnan(t)) current_readings.raw_temp = t;
    if (!isnan(h)) current_readings.raw_humidity = h;

    current_readings.adc_mq2 = analogRead(MQ2_ADC_PIN);
    current_readings.pir_raw = digitalRead(PIR_PIN);
    current_readings.adc_ldr = analogRead(LDR_ADC_PIN);
  }

  // Apply calibration engines
  current_readings.cal_temp = calibration.calibrateDHT11(current_readings.raw_temp);
  current_readings.cal_humidity = calibration.calibrateHumidity(current_readings.raw_humidity);
  current_readings.ppm_mq2 = calibration.readMQ2ppm(current_readings.adc_mq2, calibration.data.mq2_r0_baseline);
  current_readings.pir_debounced = calibration.debouncePIR(current_readings.pir_raw, millis());
  current_readings.ldr_normalized = calibration.normalizeLDR(current_readings.adc_ldr, calibration.data);
  current_readings.timestamp_ms = millis();
}

void runComputationPipeline() {
  // --- PIPELINE STAGE 1: Real-time Multi-Sensor Risk Fusion (Subject: DMS) ---
  unsigned long t0 = micros();
  fusion.normalizeSensors(current_readings, current_norm);
  perf_logger.logFusionTime(micros() - t0);

  // --- PIPELINE STAGE 2: Minimization Minterm Algebra Checks (Subject: DMS Gates) ---
  current_binary = getBinaryStates(current_norm);
  current_alerts = evaluateAlerts(current_binary);

  // --- PIPELINE STAGE 3: Formal state transitions delta evaluations ---
  unsigned long t1 = micros();
  bool sensor_fault = health_monitor.isFaultActive();

  if (force_alert_escalation) {
    // Escalates active danger status artificially to simulate cloud loops
    if (current_norm.risk_score < 0.70f) {
      current_norm.risk_score = 0.72f; // Promotes to at least ALERT_HIGH
    }
    force_alert_escalation = false;
  }

  SystemState next_state = fsm.transition(current_norm.risk_score, sensor_fault);
  perf_logger.logFSMTransition(micros() - t1);

  // --- PIPELINE STAGE 4: Actuator execution (Moore state-actions machine) ---
  unsigned long act_start_ms = millis();
  actuators.setStateOutput(next_state);
  perf_logger.logAlertLatency(millis() - act_start_ms);

  // --- PIPELINE STAGE 5: Graph Topologies Weight Recalculation (Subject: DAA) ---
  unsigned long t2 = micros();
  graph.updateRiskScores(current_norm.risk_score);
  graph.updateAllWeights();
  perf_logger.logGraphUpdate(micros() - t2);

  // --- PIPELINE STAGE 6: BFS Minimum-Hop Warning Wave (Subject: DAA Traversals) ---
  int local_source_hazard = 0; // default safe center point
  if (current_alerts.fire || current_alerts.gas) {
    local_source_hazard = 1; // Kitchen zone index source
  } else if (current_alerts.intrusion) {
    local_source_hazard = 2; // Bedroom zone source
  }
  
  unsigned long t3 = micros();
  current_bfs = bfs.run(graph, local_source_hazard);
  perf_logger.logBFSTime(micros() - t3);

  // --- PIPELINE STAGE 7: DFS Cycle Trace Anomaly Check (Subject: DAA Cycles) ---
  unsigned long t4 = micros();
  current_dfs = dfs_algo.run(graph, local_source_hazard);
  perf_logger.logDFSTime(micros() - t4);

  // --- PIPELINE STAGE 8: Dijkstra Evacuation escape plans (Subject: DAA Shortest Path) ---
  unsigned long t5 = micros();
  current_dijkstra = dijkstra.run(graph, 2, 4); // Bedroom to Exterior exit points
  perf_logger.logDijkstraTime(micros() - t5);

  // Run dynamic comparisons
  dijkstra.compareWithBFS(current_dijkstra, current_bfs, 2, 4);

  // --- PIPELINE STAGE 9: Cyclic Diagnostics Serialization ---
#if DEBUG_LOG
  if (millis() - last_sensor_read_ms >= 5000) {
    last_sensor_read_ms = millis();
    Serial.printf("[Backplane Status] Cycle: %lu | R: %.3f | FSM State: %s | BFS vis count: %d | DijCost: %.3f\n",
                  cycle_start_ms, current_norm.risk_score, fsm.getCurrentStateName(), current_bfs.n_visited, current_dijkstra.total_cost);
  }
#endif
}

void handleNetworking() {
  mqtt_client.loop();
  feedback_server.handleClient();

  if (mqtt_client.isConnected()) {
    // Stream complete dynamic JSON frames to RPi broker database
    mqtt_client.publishSensorData(current_norm, current_readings, fsm.getCurrentState(),
                                  current_bfs, current_dfs, current_dijkstra,
                                  current_alerts, graph);
    mqtt_client.flushQueue();
  } else {
    mqtt_client.connect();
  }

  // Push HTTP metrics up to ThingSpeak over Secure Sockets (Subject: Networks HTTP rate limiting)
  if (thingspeak.shouldUpload(fsm.getUploadInterval())) {
    unsigned long ts_tx_ms = millis();
    bool upload_success = thingspeak.upload(current_readings, current_norm, fsm.getCurrentState(), current_alerts);
    if (upload_success) {
      perf_logger.logThingSpeakLatency(millis() - ts_tx_ms);
      perf_logger.logCloudLatency(millis() - ts_tx_ms);
    }
  }
}

void loop() {
  esp_task_wdt_reset(); // Safe refresh
  cycle_start_ms = millis();
  perf_logger.incrementCycle();

  // 1. Health monitor runs on a 30-second interval sweep
  if (millis() - last_health_check_ms >= HEALTH_CHECK_INTERVAL_MS) {
    health_monitor.performHealthCheck(current_readings);
    last_health_check_ms = millis();
  }

  // 2. Refresh active sensor streams
  readAllSensors();

  // 3. Compute the pipelines
  runComputationPipeline();

  // 4. Update async visual flasher registers
  actuators.update(fsm.getCurrentState(), millis());

  // 5. Network transport execution
  handleNetworking();

  // 6. Generate device consolidated statistics reports every 100 loops
  if (perf_logger.getCycleCount() % 100 == 0) {
    perf_logger.printPerformanceReport();
    if (mqtt_client.isConnected()) {
      mqtt_client.publishPerformanceMetrics(perf_logger);
    }
  }

  // 7. Dynamic adaptive scheduler (FSM Moore machine output determines wait limits)
  unsigned long processing_duration_ms = millis() - cycle_start_ms;
  unsigned long mandated_wait_ms = fsm.getUploadInterval();
  if (processing_duration_ms < mandated_wait_ms) {
    delay(mandated_wait_ms - processing_duration_ms);
  }
}
