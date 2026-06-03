/**
 * =========================================================================
 * Smart Home Monitoring System — ThingSpeak Client (thingspeak_client.h)
 * =========================================================================
 */

#ifndef THINGSPEAK_CLIENT_H
#define THINGSPEAK_CLIENT_H

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include "sensor_fusion.h"
#include "fsm_engine.h"
#include "boolean_minimized.h"

class ThingSpeakClient {
private:
  WiFiClientSecure secure_client;
  unsigned long last_upload_ms;
  unsigned long upload_latency_ms;
  int upload_retry_count;

public:
  ThingSpeakClient();
  void initialize();
  bool upload(const SensorReadings& raw, const NormalizedValues& norm, SystemState state, const AlertFlags& alerts);
  bool shouldUpload(unsigned long fsm_interval) const;
  unsigned long getLastUploadLatencyMs() const;
};

#endif // THINGSPEAK_CLIENT_H
