/**
 * =========================================================================
 * Smart Home Monitoring System — Sensor Calibration (sensor_calibration.cpp)
 * =========================================================================
 */

#include "sensor_calibration.h"
#include "config.h"
#include <EEPROM.h>

SensorCalibration::SensorCalibration() {
  start_time_ms = millis();
  last_debounce_time = 0;
  last_pir_state = LOW;
  debounced_pir_state = LOW;
  initDefaultCalibration();
}

void SensorCalibration::initialize() {
  if (!loadCalibrationFromEEPROM()) {
    initDefaultCalibration();
    saveCalibrationToEEPROM(data);
  }
}

bool SensorCalibration::loadCalibrationFromEEPROM() {
  byte check_flag;
  EEPROM.get(16, check_flag);
  if (check_flag == 0xAA) {
    EEPROM.get(0, data.temp_offset);
    EEPROM.get(4, data.mq2_r0_baseline);
    EEPROM.get(8, data.ldr_v_min);
    EEPROM.get(12, data.ldr_v_max);
    data.valid = true;
    return true;
  }
  return false;
}

void SensorCalibration::saveCalibrationToEEPROM(const CalibrationData& cal) {
  EEPROM.put(0, cal.temp_offset);
  EEPROM.put(4, cal.mq2_r0_baseline);
  EEPROM.put(8, cal.ldr_v_min);
  EEPROM.put(12, cal.ldr_v_max);
  EEPROM.write(16, 0xAA);
  EEPROM.commit();
}

void SensorCalibration::initDefaultCalibration() {
  data.temp_offset = TEMP_OFFSET;
  data.mq2_r0_baseline = 10000.0f; // Default baseline in clean air
  data.ldr_v_min = 100.0f;          // Raw ADC min LDR output (Bright)
  data.ldr_v_max = 4000.0f;         // Raw ADC max LDR output (Dark)
  data.valid = true;
}

float SensorCalibration::calibrateDHT11(float raw_temp) {
  return raw_temp + data.temp_offset;
}

float SensorCalibration::calibrateHumidity(float raw_humidity) {
  return raw_humidity; // Simple identity map as specified
}

void SensorCalibration::warmupMQ2() {
  Serial.println("[MQ2] Warming up sensor for gas reading...");
  unsigned long start_warmup = millis();
  while (millis() - start_warmup < MQ2_WARMUP_MS) {
    unsigned long remaining = (MQ2_WARMUP_MS - (millis() - start_warmup)) / 1000;
    Serial.printf("[MQ2] Warmup active. Remaining: %lu seconds\n", remaining);
    delay(2000);
  }
  Serial.println("[MQ2] Sensor warmed up.");
}

float SensorCalibration::readMQ2ppm(int adc_raw, float r0) {
  float v_adc = (adc_raw * 3.3f) / 4095.0f;
  float v_mq2 = v_adc * 2.0f; // Re-scaling via resistor network division
  if (v_mq2 < 0.1f) return 0.0f; // Avoid divide-by-zero singularities

  // Read RS load resistor
  float rs = ((5.0f / v_mq2) - 1.0f) * 10000.0f;
  float ratio = rs / r0;
  float ppm = MQ2_A * pow(ratio, MQ2_B);
  return constrain(ppm, 0.0f, 10000.0f);
}

void SensorCalibration::updateMQ2Baseline(float current_rs) {
  // Infinite Impulse Response filter to track long-term trends
  data.mq2_r0_baseline = (0.999f * data.mq2_r0_baseline) + (0.001f * current_rs);
}

int SensorCalibration::debouncePIR(int gpio_reading, unsigned long current_millis) {
  if (gpio_reading != last_pir_state) {
    last_debounce_time = current_millis;
  }
  if ((current_millis - last_debounce_time) > 500) { // Under 500ms jitter window
    if (gpio_reading != debounced_pir_state) {
      debounced_pir_state = gpio_reading;
    }
  }
  last_pir_state = gpio_reading;
  return debounced_pir_state;
}

float SensorCalibration::normalizeLDR(int adc_raw, CalibrationData& cal_data) {
  // Update ambient bounds organically as lighting shifts
  if (adc_raw < cal_data.ldr_v_min && adc_raw > 10) {
    cal_data.ldr_v_min = adc_raw;
  }
  if (adc_raw > cal_data.ldr_v_max && adc_raw < 4080) {
    cal_data.ldr_v_max = adc_raw;
  }

  float range = cal_data.ldr_v_max - cal_data.ldr_v_min;
  if (range <= 10.0f) return 0.5f;

  float norm = (adc_raw - cal_data.ldr_v_min) / range;
  return constrain(norm, 0.0f, 1.0f);
}

int SensorCalibration::getCalibrationQuality() {
  unsigned long age = millis() - start_time_ms;
  if (age > 3600000) return 100; // Mature baseline (1 hour)
  return (int)((age * 100.0f) / 3600000.0f);
}
