/**
 * =========================================================================
 * Smart Home Monitoring System — Performance Logger (performance_logger.h)
 * =========================================================================
 */

#ifndef PERFORMANCE_LOGGER_H
#define PERFORMANCE_LOGGER_H

#include <Arduino.h>
#include "config.h"

struct PerformanceBuffer {
  float data[PERF_BUFFER_SIZE];
  int index;
  int count;
  bool full;
};

class PerformanceLogger {
private:
  PerformanceBuffer alert_latency_ms;
  PerformanceBuffer cloud_latency_ms;
  PerformanceBuffer fusion_time_us;
  PerformanceBuffer graph_update_us;
  PerformanceBuffer bfs_time_us;
  PerformanceBuffer dfs_time_us;
  PerformanceBuffer dijkstra_time_us;
  PerformanceBuffer fsm_transition_us;
  PerformanceBuffer mqtt_latency_ms;
  PerformanceBuffer thingspeak_latency_ms;
  int cycle_count;

  void addToBuffer(PerformanceBuffer& buf, float value);
  float computeMean(const PerformanceBuffer& buf) const;
  float computeStdDev(const PerformanceBuffer& buf) const;
  float computePercentile95(PerformanceBuffer& buf) const; // Helper requires sorting a copy

public:
  PerformanceLogger();
  void initialize();
  
  void logAlertLatency(float ms);
  void logCloudLatency(float ms);
  void logFusionTime(float us);
  void logGraphUpdate(float us);
  void logBFSTime(float us);
  void logDFSTime(float us);
  void logDijkstraTime(float us);
  void logFSMTransition(float us);
  void logMQTTLatency(float ms);
  void logThingSpeakLatency(float ms);
  
  void incrementCycle();
  int getCycleCount() const;
  
  void printPerformanceReport();
  String serializeToJSON();
};

#endif // PERFORMANCE_LOGGER_H
