/**
 * =========================================================================
 * Smart Home Monitoring System — Sensor Calibration (sensor_calibration.h)
 * =========================================================================
 */

#ifndef SENSOR_CALIBRATION_H
#define SENSOR_CALIBRATION_H

#include <Arduino.h>

struct CalibrationData {
  float temp_offset;
  float mq2_r0_baseline;
  float ldr_v_min;
  float ldr_v_max;
  bool valid;
};

class SensorCalibration {
private:
  unsigned long start_time_ms;
  unsigned long last_debounce_time;
  int last_pir_state;
  int debounced_pir_state;

public:
  CalibrationData data;

  SensorCalibration();
  void initialize();
  bool loadCalibrationFromEEPROM();
  void saveCalibrationToEEPROM(const CalibrationData& cal);
  void initDefaultCalibration();
  
  float calibrateDHT11(float raw_temp);
  float calibrateHumidity(float raw_humidity);
  void warmupMQ2();
  float readMQ2ppm(int adc_raw, float r0);
  void updateMQ2Baseline(float current_rs);
  int debouncePIR(int gpio_reading, unsigned long current_millis);
  float normalizeLDR(int adc_raw, CalibrationData& cal_data);
  int getCalibrationQuality();
};

#endif // SENSOR_CALIBRATION_H
