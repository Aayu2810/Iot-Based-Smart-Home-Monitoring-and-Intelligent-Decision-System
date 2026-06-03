/**
 * =========================================================================
 * Smart Home Monitoring System — Deterministic FSM Engine (fsm_engine.cpp)
 * =========================================================================
 */

#include "fsm_engine.h"
#include "config.h"

FSMEngine::FSMEngine() {
  initialize();
}

void FSMEngine::initialize() {
  current_state = STATE_IDLE;
  previous_state = STATE_IDLE;
  livelock_counter = 0;
  last_transition_time_ms = 0;
  state_entry_time_ms = millis();
  transition_time_us = 0;

  // --- Complete 36-entry formal FSM delta transition matrix (Subject: DMS) ---
  
  // Row 0: STATE_IDLE
  transition_table[STATE_IDLE][SIGMA_0] = STATE_IDLE;
  transition_table[STATE_IDLE][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_IDLE][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_IDLE][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_IDLE][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_IDLE][SIGMA_5] = STATE_FAULT;

  // Row 1: STATE_MONITOR
  transition_table[STATE_MONITOR][SIGMA_0] = STATE_IDLE;
  transition_table[STATE_MONITOR][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_MONITOR][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_MONITOR][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_MONITOR][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_MONITOR][SIGMA_5] = STATE_FAULT;

  // Row 2: STATE_ALERT_LOW
  transition_table[STATE_ALERT_LOW][SIGMA_0] = STATE_MONITOR;
  transition_table[STATE_ALERT_LOW][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_ALERT_LOW][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_ALERT_LOW][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_ALERT_LOW][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_ALERT_LOW][SIGMA_5] = STATE_FAULT;

  // Row 3: STATE_ALERT_HIGH
  transition_table[STATE_ALERT_HIGH][SIGMA_0] = STATE_MONITOR;
  transition_table[STATE_ALERT_HIGH][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_ALERT_HIGH][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_ALERT_HIGH][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_ALERT_HIGH][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_ALERT_HIGH][SIGMA_5] = STATE_FAULT;

  // Row 4: STATE_CRITICAL
  transition_table[STATE_CRITICAL][SIGMA_0] = STATE_MONITOR;
  transition_table[STATE_CRITICAL][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_CRITICAL][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_CRITICAL][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_CRITICAL][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_CRITICAL][SIGMA_5] = STATE_FAULT;

  // Row 5: STATE_FAULT
  transition_table[STATE_FAULT][SIGMA_0] = STATE_IDLE;
  transition_table[STATE_FAULT][SIGMA_1] = STATE_MONITOR;
  transition_table[STATE_FAULT][SIGMA_2] = STATE_ALERT_LOW;
  transition_table[STATE_FAULT][SIGMA_3] = STATE_ALERT_HIGH;
  transition_table[STATE_FAULT][SIGMA_4] = STATE_CRITICAL;
  transition_table[STATE_FAULT][SIGMA_5] = STATE_FAULT;
}

InputSigma FSMEngine::discretizeInput(float R, bool sensor_fault) {
  if (sensor_fault) return SIGMA_5;
  if (R < THRESH_SIGMA0) return SIGMA_0;
  if (R < THRESH_SIGMA1) return SIGMA_1;
  if (R < THRESH_SIGMA2) return SIGMA_2;
  if (R < THRESH_SIGMA3) return SIGMA_3;
  return SIGMA_4;
}

SystemState FSMEngine::transition(float R, bool sensor_fault) {
  unsigned long start_time_us = micros();
  InputSigma input_symbol = discretizeInput(R, sensor_fault);
  
  SystemState next = transition_table[current_state][input_symbol];

  // --- DMS: Livelock mitigation loops (Defense against boundary jitter oscillations) ---
  if (current_state == next && (current_state == STATE_ALERT_HIGH || current_state == STATE_CRITICAL)) {
    livelock_counter++;
    if (livelock_counter >= T_MAX_LIVELOCK) {
      livelock_counter = 0;
      next = STATE_CRITICAL; // High priority force escalation
      Serial.println("[FSM Livelock] Oscillatory limit breached. Forcing CRITICAL state!");
    }
  } else {
    livelock_counter = 0;
  }

  if (next != current_state) {
    previous_state = current_state;
    current_state = next;
    last_transition_time_ms = millis();
    state_entry_time_ms = millis();
    Serial.printf("[FSM Transition] Changed: %s -> %s (Sigma Symbol: %d, Risk R: %.4f)\n",
                  getStateName(previous_state), getStateName(current_state), input_symbol, R);
  }

  transition_time_us = micros() - start_time_us;
  return current_state;
}

SystemState FSMEngine::getCurrentState() const {
  return current_state;
}

SystemState FSMEngine::getPreviousState() const {
  return previous_state;
}

const char* FSMEngine::getStateName(SystemState s) const {
  switch (s) {
    case STATE_IDLE:       return "IDLE";
    case STATE_MONITOR:    return "MONITOR";
    case STATE_ALERT_LOW:  return "ALERT_LOW";
    case STATE_ALERT_HIGH: return "ALERT_HIGH";
    case STATE_CRITICAL:   return "CRITICAL";
    case STATE_FAULT:      return "FAULT";
    default:               return "UNKNOWN";
  }
}

const char* FSMEngine::getCurrentStateName() const {
  return getStateName(current_state);
}

// Moore outputs: state determines transmission/reporting intervals (Subject: Networks)
unsigned long FSMEngine::getUploadInterval() const {
  switch (current_state) {
    case STATE_IDLE:       return 60000UL; // 1 min (Standard background load reduction)
    case STATE_MONITOR:    return 30000UL; // 30 sec
    case STATE_ALERT_LOW:  return 15000UL; // 15 sec (Required minimum interval threshold)
    case STATE_ALERT_HIGH: return 5000UL;  // 5 sec  (Accelerated channel capacity telemetry)
    case STATE_CRITICAL:   return 15000UL; // 15 sec (Constrained to protect ThingSpeak limit while active)
    case STATE_FAULT:      return 10000UL; // 10 sec
    default:               return 30000UL;
  }
}

int FSMEngine::getMQTTQoS() const {
  switch (current_state) {
    case STATE_CRITICAL:   return 2; // Exact confirmation handshake (Exactly-Once delivery model)
    case STATE_ALERT_HIGH: return 1; // Basic confirmation (At-Least-Once delivery)
    case STATE_FAULT:      return 1;
    default:               return 0; // Simple fire-and-forget (Best effort QoS 0)
  }
}

int FSMEngine::getBuzzerFrequency() const {
  switch (current_state) {
    case STATE_ALERT_LOW:  return 500;  // 500 Hz chime pulse
    case STATE_ALERT_HIGH: return 1000; // 1000 Hz sharp warning pulse
    case STATE_CRITICAL:   return 2000; // 2000 Hz continuous distress frequency
    default:               return 0;    // Silent
  }
}

unsigned long FSMEngine::getStateEntryTime() const {
  return state_entry_time_ms;
}

unsigned long FSMEngine::getTransitionTimeUs() const {
  return transition_time_us;
}

void FSMEngine::printFSMStatus() {
  Serial.println("==================== FSM STATUS REPORT ====================");
  Serial.printf("Current State: %s (Previous: %s) | In-State Duration: %lu ms\n",
                getCurrentStateName(), getStateName(previous_state), millis() - state_entry_time_ms);
  Serial.printf("MQTT QoS level: %d | Reporting Period: %lu ms | Sounder: %d Hz\n",
                getMQTTQoS(), getUploadInterval(), getBuzzerFrequency());
  Serial.println("===========================================================");
}

void FSMEngine::verifyProperties() {
  Serial.println("[FSM Validator] Reviewing Myhill-Nerode properties...");
  bool comprehensive = true;
  for (int st = 0; st < 6; st++) {
    for (int sig = 0; sig < 6; sig++) {
      SystemState outcome = transition_table[st][sig];
      if (outcome < 0 || outcome > 5) {
        comprehensive = false;
        Serial.printf("[Error] Undefined state outcome in transition matrix at [%d][%d]!\n", st, sig);
      }
    }
  }
  if (comprehensive) {
    Serial.println("[FSM Validator] Deterministic 36-entry delta matrix is fully populated.");
  }
}
