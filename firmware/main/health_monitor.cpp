/**
 * =========================================================================
 * Smart Home Monitoring System — Health Monitor (health_monitor.cpp)
 * =========================================================================
 */

#include "health_monitor.h"

HealthMonitor::HealthMonitor() {
  last_check_ms = 0;
  fault_active = false;
  initialize();
}

void HealthMonitor::initialize() {
  fault_active = false;
  for (int i = 0; i < 5; i++) {
    health.status[i] = STATUS_HEALTHY;
    health.fault_start_time_ms[i] = 0;
    health.consecutive_healthy_cycles[i] = 0;
    health.reading_index[i] = 0;
    for (int j = 0; j < 5; j++) {
      health.recent_readings[i][j] = 0.5f; // Initialize to reasonable mid-ranges
    }
  }
}

float HealthMonitor::computeVariance(const float readings[], int n) const {
  float sum = 0.0f;
  for (int i = 0; i < n; i++) sum += readings[i];
  float mean = sum / n;

  float var_sum = 0.0f;
  for (int i = 0; i < n; i++) {
    var_sum += (readings[i] - mean) * (readings[i] - mean);
  }
  return var_sum / n;
}

float HealthMonitor::computeMedian(float readings[], int n) const {
  // Sort lightweight bubble sort
  float temp[5];
  for (int i = 0; i < n; i++) temp[i] = readings[i];

  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - i - 1; j++) {
      if (temp[j] > temp[j + 1]) {
        float t = temp[j];
        temp[j] = temp[j + 1];
        temp[j + 1] = t;
      }
    }
  }
  return temp[n / 2]; // For n=5, returns index 2
}

SensorStatus HealthMonitor::checkSensor(SensorID id, const float readings[], int n, 
                                        float valid_min, float valid_max, float spike_threshold) {
  float var = computeVariance(readings, n);
  bool all_same = (var < 0.00001f);
  float latest = readings[n - 1];
  bool in_range = (latest >= valid_min && latest <= valid_max);
  float delta = abs(latest - readings[0]);

  // If a sensor is stuck reading exactly the same out-of-bounds value, it has failed
  if (all_same && !in_range) {
    return STATUS_FAILED;
  }
  
  // Implausible transient spikes (Subject: DMS Signal Denoising)
  if (delta > spike_threshold && id != SENSOR_PIR) {
    return STATUS_SUSPECT;
  }

  if (!in_range) {
    return STATUS_FAILED;
  }

  return STATUS_HEALTHY;
}

bool HealthMonitor::performHealthCheck(const SensorReadings& readings) {
  // 1. Shift and append new readings to the sliding diagnostics window
  float latest_vals[5] = {
    readings.cal_temp,
    readings.cal_humidity,
    readings.ppm_mq2,
    (float)readings.pir_debounced,
    readings.ldr_normalized
  };

  for (int s = 0; s < 5; s++) {
    int idx = health.reading_index[s];
    health.recent_readings[s][idx] = latest_vals[s];
    health.reading_index[s] = (idx + 1) % 5;
  }

  // 2. Evaluate status
  bool any_failed = false;
  float bounds[5][3] = {
    {-5.0f, 65.0f, 15.0f},   // SENSOR_TEMP: min, max, spike threshold
    {0.0f, 100.0f, 25.0f},   // SENSOR_HUM
    {0.0f, 9500.0f, 2000.0f}, // SENSOR_MQ2
    {0.0f, 1.1f, 1.5f},      // SENSOR_PIR
    {0.0f, 1.1f, 0.9f}       // SENSOR_LDR
  };

  for (int s = 0; s < 5; s++) {
    SensorStatus prev_status = health.status[s];
    SensorStatus current_status = checkSensor((SensorID)s, health.recent_readings[s], 5, 
                                              bounds[s][0], bounds[s][1], bounds[s][2]);
    health.status[s] = current_status;

    if (current_status == STATUS_HEALTHY) {
      health.consecutive_healthy_cycles[s]++;
      if (prev_status == STATUS_FAILED && health.consecutive_healthy_cycles[s] >= 10) {
        // Recover naturally if stable for 10 consecutive cycles
        health.status[s] = STATUS_HEALTHY;
        health.fault_start_time_ms[s] = 0;
        Serial.printf("[Health Monitor] Sensor '%s' recovered. Re-entering healthy mode.\n", getSensorName((SensorID)s));
      }
    } else if (current_status == STATUS_FAILED) {
      any_failed = true;
      health.consecutive_healthy_cycles[s] = 0;
      if (prev_status != STATUS_FAILED) {
        health.fault_start_time_ms[s] = millis();
        Serial.printf("[Health Monitor] FAIL DETECTED: Sensor '%s' has failed diagnostics.\n", getSensorName((SensorID)s));
      }
    } else if (current_status == STATUS_SUSPECT) {
      // Suspect files apply median filter directly to smoothen anomalies
      health.consecutive_healthy_cycles[s] = 0;
    }
  }

  // 3. Evaluate combined fault flag
  if (any_failed && !fault_active) {
    fault_active = true;
    return true; // Triggered transitional fault state (Sigma 5)
  }
  
  if (!any_failed && fault_active) {
    fault_active = false;
    Serial.println("[Health Monitor] All sensors verified functional. Normal operation resumed.");
  }

  return false;
}

bool HealthMonitor::isFaultActive() const {
  return fault_active;
}

SensorStatus HealthMonitor::getSensorStatus(SensorID id) const {
  return health.status[id];
}

float HealthMonitor::getMedianFiltered(SensorID id) const {
  float readings_copy[5];
  for (int i = 0; i < 5; i++) {
    readings_copy[i] = health.recent_readings[id][i];
  }
  return computeMedian(readings_copy, 5);
}

unsigned long HealthMonitor::getFaultDuration(SensorID id) const {
  if (health.status[id] == STATUS_FAILED && health.fault_start_time_ms[id] > 0) {
    return millis() - health.fault_start_time_ms[id];
  }
  return 0;
}

const char* HealthMonitor::getSensorName(SensorID id) const {
  switch (id) {
    case SENSOR_TEMP: return "Temperature";
    case SENSOR_HUM:  return "Humidity";
    case SENSOR_MQ2:  return "MQ2 MQ_Gas";
    case SENSOR_PIR:  return "PIR PIR_Motion";
    case SENSOR_LDR:  return "LDR LDR_Light";
    default:          return "Unknown";
  }
}

void HealthMonitor::printHealthReport() const {
  Serial.println("================= SENSOR HEALTH AUDIT ===================");
  Serial.printf("Fault Global active vector flag: %s\n", fault_active ? "TRUE (FSM REDIRECT SIGMA_5)" : "FALSE (SYSTEM CLEAN)");
  for (int i = 0; i < 5; i++) {
    const char* st_label = "HEALTHY";
    if (health.status[i] == STATUS_SUSPECT) st_label = "SUSPECT (FILTERING)";
    else if (health.status[i] == STATUS_FAILED) st_label = "FAILED (HARD OUT)";
    
    Serial.printf("  - Sensor %d [%12s]: %s | Fault Duration: %lu ms\n",
                  i, getSensorName((SensorID)i), st_label, getFaultDuration((SensorID)i));
  }
  Serial.println("=========================================================");
}
