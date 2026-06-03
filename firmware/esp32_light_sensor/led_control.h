#pragma once
#include "config.h"

// Initialize the single status LED
inline void initStatusLED() {
  pinMode(SINGLE_LED_PIN, OUTPUT);
  digitalWrite(SINGLE_LED_PIN, LOW);
}

// Set LED state: true = ON, false = OFF
inline void setStatusLED(bool on) {
  digitalWrite(SINGLE_LED_PIN, on ? HIGH : LOW);
}
