/**
 * =========================================================================
 * Smart Home Monitoring System — Health Monitor (health_monitor.h)
 * =========================================================================
 */

#ifndef HEALTH_MONITOR_H
#define HEALTH_MONITOR_H

#include <Arduino.h>
#include "sensor_fusion.h"

enum SensorID {
  SENSOR_TEMP = 0,
  SENSOR_HUM = 1,
  SENSOR_MQ2 = 2,
  SENSOR_PIR = 3,
  SENSOR_LDR = 4
};

enum SensorStatus {
  STATUS_HEALTHY,
  STATUS_SUSPECT,
  STATUS_FAILED
};

struct SensorHealth {
  SensorStatus status[5];
  unsigned long fault_start_time_ms[5];
  int consecutive_healthy_cycles[5];
  float recent_readings[5][5]; // Sliding window of size 5 for each sensor
  int reading_index[5];
};

class HealthMonitor {
private:
  SensorHealth health;
  unsigned long last_check_ms;
  bool fault_active;

  float computeVariance(const float readings[], int n) const;
  float computeMedian(float readings[], int n) const;

public:
  HealthMonitor();
  void initialize();
  
  SensorStatus checkSensor(SensorID id, const float readings[], int n, 
                           float valid_min, float valid_max, float spike_threshold);
                           
  bool performHealthCheck(const SensorReadings& readings);
  
  bool isFaultActive() const;
  SensorStatus getSensorStatus(SensorID id) const;
  float getMedianFiltered(SensorID id) const;
  void printHealthReport() const;
  unsigned long getFaultDuration(SensorID id) const;
  const char* getSensorName(SensorID id) const;
};

#endif // HEALTH_MONITOR_H
