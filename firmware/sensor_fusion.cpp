/**
 * =========================================================================
 * Smart Home Monitoring System — Weighted Risk Fusion (sensor_fusion.cpp)
 * =========================================================================
 */

#include "sensor_fusion.h"
#include "config.h"

SensorFusion::SensorFusion() {
  last_risk_score = 0.0f;
  for(int i = 0; i < 5; i++) sensor_vector[i] = 0.0f;
}

void SensorFusion::normalizeSensors(SensorReadings& raw, NormalizedValues& out) {
  unsigned long start_time_us = micros();

  // 1. Normalizing Temperature (T) between 20C and 45C
  out.n_T = constrain((raw.cal_temp - 20.0f) / (45.0f - 20.0f), 0.0f, 1.0f);

  // 2. Normalizing Gas/Smoke (S) linearly on the MQ2 curve capped at 1000 ppm
  out.n_S = constrain(raw.ppm_mq2 / 1000.0f, 0.0f, 1.0f);

  // 3. Normalizing PIR Motion (P) (as a direct indicator)
  out.n_P = (float)raw.pir_debounced;

  // 4. Normalizing Desorption Dry Humidity (H) (Higher danger in lower humidity/dry air)
  out.n_H = constrain(1.0f - (raw.cal_humidity / 100.0f), 0.0f, 1.0f);

  // 5. Normalizing Darkness (L) (Darkness represents an intrusion risk booster)
  out.n_L = constrain(1.0f - raw.ldr_normalized, 0.0f, 1.0f);

  // Save localized sensor vector values
  sensor_vector[0] = out.n_T;
  sensor_vector[1] = out.n_S;
  sensor_vector[2] = out.n_P;
  sensor_vector[3] = out.n_H;
  sensor_vector[4] = out.n_L;

  // 6. Compute fused Risk R
  out.risk_score = (W_T * out.n_T) + 
                   (W_S * out.n_S) + 
                   (W_P * out.n_P) + 
                   (W_H * out.n_H) + 
                   (W_L * out.n_L);

  out.risk_score = constrain(out.risk_score, 0.0f, 1.0f);
  last_risk_score = out.risk_score;

#if DEBUG_LOG
  // Ensure math constraints are sound in development mode
  if (out.risk_score < 0.0f || out.risk_score > 1.0f) {
    Serial.println("[CRITICAL ERROR] Risk Score out of math bounds [0.0, 1.0]!");
  }
#endif

  out.fusion_time_us = micros() - start_time_us;
}

float SensorFusion::getRiskScore() const {
  return last_risk_score;
}

const float* SensorFusion::getSensorVector() const {
  return sensor_vector;
}

void SensorFusion::printFusionReport(const SensorReadings& raw, const NormalizedValues& out) {
  Serial.println("================== SENSOR FUSION REPORT ==================");
  Serial.printf("Raw Telemetry: Temp: %.1fC, Humid: %.1f%%, Gas: %.1f ppm, PIR: %d, LDR: %d\n",
                raw.cal_temp, raw.cal_humidity, raw.ppm_mq2, raw.pir_debounced, raw.adc_ldr);
  Serial.printf("Normalized Vectors: n_T: %.3f, n_S: %.3f, n_P: %.3f, n_H: %.3f, n_L: %.3f\n",
                out.n_T, out.n_S, out.n_P, out.n_H, out.n_L);
  Serial.printf("Fused Risk R: %.4f | Execution Time: %lu us\n", out.risk_score, out.fusion_time_us);
  Serial.println("==========================================================");
}
