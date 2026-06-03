/**
 * =========================================================================
 * Smart Home Monitoring System — Actuator Control (actuator_control.cpp)
 * =========================================================================
 */

#include "actuator_control.h"
#include "config.h"

ActuatorControl::ActuatorControl() {
  last_flash_toggle_ms = 0;
  flash_state = false;
  current_buzzer_freq = 0;
  buzzer_active = false;
}

void ActuatorControl::initialize() {
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(ORANGE_LED_PIN, OUTPUT);
  pinMode(YELLOW_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(BLUE_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  // Initialize LEDC PWM channel for driving physical buzzer
  ledcSetup(0, 2000, 8); // Channel 0, 2kHz base, 8-bit resolution
  ledcAttachPin(BUZZER_PIN, 0);
  
  allOff();
}

void ActuatorControl::setStateOutput(SystemState state) {
  // Reset non-flashing indicator lines initially
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(YELLOW_LED_PIN, LOW);
  digitalWrite(ORANGE_LED_PIN, LOW);
  
  if (state != STATE_CRITICAL) {
    digitalWrite(RED_LED_PIN, LOW);
  }
  if (state != STATE_FAULT) {
    digitalWrite(BLUE_LED_PIN, LOW);
  }

  // Set buzzer and state outputs matching Moore machine (Subject: DMS)
  switch (state) {
    case STATE_IDLE:
      allOff();
      break;

    case STATE_MONITOR:
      digitalWrite(GREEN_LED_PIN, HIGH);
      setBuzzerFrequency(0);
      break;

    case STATE_ALERT_LOW:
      digitalWrite(YELLOW_LED_PIN, HIGH);
      setBuzzerFrequency(500); // 500Hz
      break;

    case STATE_ALERT_HIGH:
      digitalWrite(ORANGE_LED_PIN, HIGH);
      setBuzzerFrequency(1000); // 1000Hz
      break;

    case STATE_CRITICAL:
      // Red flash is driven dynamically inside the update() loop
      setBuzzerFrequency(2000); // 2000Hz continuous
      break;

    case STATE_FAULT:
      // Blue flash driven inside update()
      setBuzzerFrequency(0); // Buzzer silent
      break;

    default:
      allOff();
      break;
  }
}

void ActuatorControl::update(SystemState state, unsigned long current_ms) {
  // Handles asynchronous flashing intervals without blocking core flow (Subject: Networks/DMS)
  switch (state) {
    case STATE_CRITICAL:
      if (current_ms - last_flash_toggle_ms >= 250) { // 2Hz = 500ms cycle -> 250ms toggle
        flash_state = !flash_state;
        digitalWrite(RED_LED_PIN, flash_state ? HIGH : LOW);
        last_flash_toggle_ms = current_ms;
      }
      break;

    case STATE_FAULT:
      if (current_ms - last_flash_toggle_ms >= 500) { // 1Hz = 1000ms cycle -> 500ms toggle
        flash_state = !flash_state;
        digitalWrite(BLUE_LED_PIN, flash_state ? HIGH : LOW);
        last_flash_toggle_ms = current_ms;
      }
      break;

    default:
      break;
  }
}

void ActuatorControl::triggerGraduatedAlert(int hop_distance) {
  // Represent physical or simulated localized zoning warnings
  switch (hop_distance) {
    case 0:
      Serial.println("[Actuators] Active Sector: RED ALERT triggered on source line.");
      break;
    case 1:
      Serial.println("[Actuators] Buffer Sector: ORANGE ALERT warning mapped across neighbors.");
      break;
    case 2:
      Serial.println("[Actuators] Distant Sector: YELLOW ALERT caution deployed.");
      break;
    default:
      break;
  }
}

void ActuatorControl::setBuzzerFrequency(int freq_hz) {
  if (freq_hz <= 0) {
    ledcWriteTone(0, 0); // Stops PWM oscillation
    current_buzzer_freq = 0;
    buzzer_active = false;
  } else {
    ledcWriteTone(0, freq_hz);
    current_buzzer_freq = freq_hz;
    buzzer_active = true;
  }
}

void ActuatorControl::allOff() {
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(ORANGE_LED_PIN, LOW);
  digitalWrite(YELLOW_LED_PIN, LOW);
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(BLUE_LED_PIN, LOW);
  ledcWriteTone(0, 0);
  buzzer_active = false;
  current_buzzer_freq = 0;
}

void ActuatorControl::printActuatorStatus(SystemState state) const {
  Serial.println("================ ACTUATOR STATUS REPORT =================");
  Serial.printf("  RED-Led  : %s | ORANGE-Led: %s | YELLOW-Led: %s\n",
                (state == STATE_CRITICAL) ? "FLASHING" : "OFF",
                (digitalRead(ORANGE_LED_PIN)) ? "ON" : "OFF",
                (digitalRead(YELLOW_LED_PIN)) ? "ON" : "OFF");
  Serial.printf("  GREEN-Led: %s | BLUE-Led  : %s | Buzzer State: %s (%d Hz)\n",
                (digitalRead(GREEN_LED_PIN)) ? "ON" : "OFF",
                (state == STATE_FAULT) ? "FLASHING" : "OFF",
                (buzzer_active) ? "ACTIVE" : "SILENT", current_buzzer_freq);
  Serial.println("=========================================================");
}
