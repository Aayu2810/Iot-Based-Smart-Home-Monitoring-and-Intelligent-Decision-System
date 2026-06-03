/**
 * =========================================================================
 * Smart Home Monitoring System — MQTT Client (mqtt_client.h)
 * =========================================================================
 */

#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "priority_queue.h"
#include "sensor_fusion.h"
#include "fsm_engine.h"
#include "bfs_algorithm.h"
#include "dfs_algorithm.h"
#include "dijkstra_algorithm.h"
#include "boolean_minimized.h"
#include "performance_logger.h"

class MQTTClient {
private:
  WiFiClient wifi_client;
  PubSubClient mqtt;
  PriorityQueue message_queue;
  unsigned long last_connect_attempt_ms;
  int connect_retry_count;
  unsigned long publish_start_time_ms;

  int getPriorityFromState(SystemState s) const;
  int getMQTTQoSFromState(SystemState s) const;

public:
  MQTTClient();
  void initialize(const char* broker_ip, int port);
  bool connect();
  void publishWithPriority(const char* payload, const char* topic, SystemState fsm_state);
  void flushQueue();
  void loop();
  bool isConnected();

  void publishSensorData(
    const NormalizedValues& norm, 
    const SensorReadings& raw,
    SystemState state, 
    const BFSResult& bfs,
    const DFSResult& dfs, 
    const DijkstraResult& dijk,
    const AlertFlags& alerts,
    const GraphEngine& graph
  );

  void publishPerformanceMetrics(PerformanceLogger& perf);
};

#endif // MQTT_CLIENT_H
