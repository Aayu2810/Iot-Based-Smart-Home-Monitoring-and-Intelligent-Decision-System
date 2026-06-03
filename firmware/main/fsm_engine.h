/**
 * =========================================================================
 * Smart Home Monitoring System — Determinisic FSM Engine (fsm_engine.h)
 * =========================================================================
 */

#ifndef FSM_ENGINE_H
#define FSM_ENGINE_H

#include <Arduino.h>

enum SystemState {
  STATE_IDLE = 0,
  STATE_MONITOR = 1,
  STATE_ALERT_LOW = 2,
  STATE_ALERT_HIGH = 3,
  STATE_CRITICAL = 4,
  STATE_FAULT = 5
};

enum InputSigma {
  SIGMA_0 = 0, // Safe (R < 0.20)
  SIGMA_1 = 1, // Monitor Safe (0.20 <= R < 0.40)
  SIGMA_2 = 2, // Low Warning (0.40 <= R < 0.65)
  SIGMA_3 = 3, // High Warning (0.65 <= R < 0.85)
  SIGMA_4 = 4, // Critical hazard (R >= 0.85)
  SIGMA_5 = 5  // Sensor Failure / Isolation anomaly
};

class FSMEngine {
private:
  SystemState current_state;
  SystemState previous_state;
  int livelock_counter;
  unsigned long last_transition_time_ms;
  unsigned long state_entry_time_ms;
  unsigned long transition_time_us;

  // The 6x6 canonical Transition Matrix
  SystemState transition_table[6][6];

public:
  FSMEngine();
  void initialize();
  InputSigma discretizeInput(float R, bool sensor_fault);
  SystemState transition(float R, bool sensor_fault);
  
  SystemState getCurrentState() const;
  SystemState getPreviousState() const;
  const char* getStateName(SystemState s) const;
  const char* getCurrentStateName() const;
  
  unsigned long getUploadInterval() const;
  int getMQTTQoS() const;
  int getBuzzerFrequency() const;
  unsigned long getStateEntryTime() const;
  unsigned long getTransitionTimeUs() const;
  
  void printFSMStatus();
  void verifyProperties();
};

#endif // FSM_ENGINE_H
