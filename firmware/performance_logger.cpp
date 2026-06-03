/**
 * =========================================================================
 * Smart Home Monitoring System — Performance Logger (performance_logger.cpp)
 * =========================================================================
 */

#include "performance_logger.h"

PerformanceLogger::PerformanceLogger() {
  initialize();
}

void PerformanceLogger::initialize() {
  cycle_count = 0;
  PerformanceBuffer* bufs[] = {
    &alert_latency_ms, &cloud_latency_ms, &fusion_time_us, &graph_update_us,
    &bfs_time_us, &dfs_time_us, &dijkstra_time_us, &fsm_transition_us,
    &mqtt_latency_ms, &thingspeak_latency_ms
  };
  for (int i = 0; i < 10; i++) {
    bufs[i]->index = 0;
    bufs[i]->count = 0;
    bufs[i]->full = false;
    for (int j = 0; j < PERF_BUFFER_SIZE; j++) {
      bufs[i]->data[j] = 0.0f;
    }
  }
}

void PerformanceLogger::addToBuffer(PerformanceBuffer& buf, float value) {
  buf.data[buf.index] = value;
  buf.index = (buf.index + 1) % PERF_BUFFER_SIZE;
  if (buf.count < PERF_BUFFER_SIZE) {
    buf.count++;
  } else {
    buf.full = true;
  }
}

float PerformanceLogger::computeMean(const PerformanceBuffer& buf) const {
  if (buf.count == 0) return 0.0f;
  float sum = 0.0f;
  for (int i = 0; i < buf.count; i++) sum += buf.data[i];
  return sum / buf.count;
}

float PerformanceLogger::computeStdDev(const PerformanceBuffer& buf) const {
  if (buf.count <= 1) return 0.0f;
  float mean = computeMean(buf);
  float sum_sq = 0.0f;
  for (int i = 0; i < buf.count; i++) {
    sum_sq += (buf.data[i] - mean) * (buf.data[i] - mean);
  }
  return sqrt(sum_sq / (buf.count - 1));
}

float PerformanceLogger::computePercentile95(PerformanceBuffer& buf) const {
  if (buf.count == 0) return 0.0f;
  
  // Copy data
  float temp[PERF_BUFFER_SIZE];
  for (int i = 0; i < buf.count; i++) temp[i] = buf.data[i];

  // Sort
  for (int i = 0; i < buf.count - 1; i++) {
    for (int j = 0; j < buf.count - i - 1; j++) {
      if (temp[j] > temp[j + 1]) {
        float t = temp[j];
        temp[j] = temp[j + 1];
        temp[j + 1] = t;
      }
    }
  }

  int target_idx = (int)(0.95f * (buf.count - 1));
  return temp[target_idx];
}

void PerformanceLogger::logAlertLatency(float ms)       { addToBuffer(alert_latency_ms, ms); }
void PerformanceLogger::logCloudLatency(float ms)       { addToBuffer(cloud_latency_ms, ms); }
void PerformanceLogger::logFusionTime(float us)         { addToBuffer(fusion_time_us, us); }
void PerformanceLogger::logGraphUpdate(float us)        { addToBuffer(graph_update_us, us); }
void PerformanceLogger::logBFSTime(float us)            { addToBuffer(bfs_time_us, us); }
void PerformanceLogger::logDFSTime(float us)            { addToBuffer(dfs_time_us, us); }
void PerformanceLogger::logDijkstraTime(float us)       { addToBuffer(dijkstra_time_us, us); }
void PerformanceLogger::logFSMTransition(float us)      { addToBuffer(fsm_transition_us, us); }
void PerformanceLogger::logMQTTLatency(float ms)        { addToBuffer(mqtt_latency_ms, ms); }
void PerformanceLogger::logThingSpeakLatency(float ms)  { addToBuffer(thingspeak_latency_ms, ms); }

void PerformanceLogger::incrementCycle() {
  cycle_count++;
}

int PerformanceLogger::getCycleCount() const {
  return cycle_count;
}

void PerformanceLogger::printPerformanceReport() {
  Serial.println("");
  Serial.println("=====================================================================");
  Serial.printf ("          IoT PERFORMANCES PROFILE BENCHMARK (Cycle: %d)\n", cycle_count);
  Serial.println("=====================================================================");
  Serial.printf (" %-22s | %8s | %8s | %8s | %5s\n", "Metric Category", "Mean", "StdDev", "95-Pct", "Count");
  Serial.println("---------------------------------------------------------------------");
  
  const char* labels[] = {
    "Alert Latency (ms)", "Total Cloud Lat (ms)", "Sensor Fusion (us)", "Graph Update (us)",
    "BFS Alarms (us)", "DFS Cycle (us)", "Dijkstra (us)", "FSM Transit (us)",
    "MQTT Pub Lat (ms)", "ThingSpeak (ms)"
  };
  
  PerformanceBuffer* bufs[] = {
    &alert_latency_ms, &cloud_latency_ms, &fusion_time_us, &graph_update_us,
    &bfs_time_us, &dfs_time_us, &dijkstra_time_us, &fsm_transition_us,
    &mqtt_latency_ms, &thingspeak_latency_ms
  };

  for(int i = 0; i < 10; i++) {
    Serial.printf(" %-22s | %8.2f | %8.2f | %8.2f | %5d\n",
                  labels[i],
                  computeMean(*bufs[i]),
                  computeStdDev(*bufs[i]),
                  computePercentile95(*bufs[i]),
                  bufs[i]->count);
  }
  Serial.println("=====================================================================");
  Serial.println("");
}

String PerformanceLogger::serializeToJSON() {
  char buf[512];
  snprintf(buf, sizeof(buf),
    "{"
      "\"cycle\":%d,"
      "\"timing\":{"
        "\"fusion\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"fsm\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"graph\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"bfs\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"dfs\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"dijkstra\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"alert_lat\":{\"mean\":%.1f,\"p95\":%.1f},"
        "\"mqtt_lat\":{\"mean\":%.1f,\"p95\":%.1f}"
      "}"
    "}",
    cycle_count,
    computeMean(fusion_time_us), computePercentile95(fusion_time_us),
    computeMean(fsm_transition_us), computePercentile95(fsm_transition_us),
    computeMean(graph_update_us), computePercentile95(graph_update_us),
    computeMean(bfs_time_us), computePercentile95(bfs_time_us),
    computeMean(dfs_time_us), computePercentile95(dfs_time_us),
    computeMean(dijkstra_time_us), computePercentile95(dijkstra_time_us),
    computeMean(alert_latency_ms), computePercentile95(alert_latency_ms),
    computeMean(mqtt_latency_ms), computePercentile95(mqtt_latency_ms)
  );
  return String(buf);
}
