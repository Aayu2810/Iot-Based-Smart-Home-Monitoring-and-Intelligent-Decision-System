/**
 * =========================================================================
 * Smart Home Monitoring System — Weighted Risk Fusion (sensor_fusion.h)
 * =========================================================================
 */

#ifndef SENSOR_FUSION_H
#define SENSOR_FUSION_H

#include <Arduino.h>

struct SensorReadings {
  float raw_temp;
  float raw_humidity;
  float cal_temp;
  float cal_humidity;
  int adc_mq2;
  float ppm_mq2;
  int pir_raw;
  int pir_debounced;
  int adc_ldr;
  float ldr_normalized;
  unsigned long timestamp_ms;
};

struct NormalizedValues {
  float n_T;
  float n_S;
  float n_P;
  float n_H;
  float n_L;
  float risk_score; // Consolidated Risk (R)
  unsigned long fusion_time_us;
};

class SensorFusion {
private:
  float last_risk_score;
  float sensor_vector[5];

public:
  SensorFusion();
  void normalizeSensors(SensorReadings& raw, NormalizedValues& out);
  float getRiskScore() const;
  const float* getSensorVector() const;
  void printFusionReport(const SensorReadings& raw, const NormalizedValues& out);
};

#endif // SENSOR_FUSION_H
