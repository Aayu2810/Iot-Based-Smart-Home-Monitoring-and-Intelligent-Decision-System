/**
 * =========================================================================
 * Smart Home Monitoring System — Actuator Control (actuator_control.h)
 * =========================================================================
 */

#ifndef ACTUATOR_CONTROL_H
#define ACTUATOR_CONTROL_H

#include <Arduino.h>
#include "fsm_engine.h"

class ActuatorControl {
private:
  unsigned long last_flash_toggle_ms;
  bool flash_state;
  int current_buzzer_freq;
  bool buzzer_active;

public:
  ActuatorControl();
  void initialize();
  void setStateOutput(SystemState state);
  void update(SystemState state, unsigned long current_ms);
  void triggerGraduatedAlert(int hop_distance);
  void setBuzzerFrequency(int freq_hz);
  void allOff();
  void printActuatorStatus(SystemState state) const;
};

#endif // ACTUATOR_CONTROL_H
