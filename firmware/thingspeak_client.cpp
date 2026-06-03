/**
 * =========================================================================
 * Smart Home Monitoring System — ThingSpeak Client (thingspeak_client.cpp)
 * =========================================================================
 */

#include "thingspeak_client.h"
#include "config.h"

// --- Root CA Certificate for api.thingspeak.com (Subject: Networks Security SSL/TLS Cert Pinning) ---
const char* THINGSPEAK_ROOT_CA = 
"-----BEGIN CERTIFICATE-----\n"
"MIIFazCCA1OgAwIBAgIRAIIOfmB76R6f83v4SyqB7IgWDQYJKoZIhvcNAQELBQAw\n"
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IERldmVs\n"
"b3BtZW50IEdyb3VwMRUwEwYDVQQDEwxJU0NHIFJvb3QgWDExMB4XDTIxMDgyMjAw\n"
"MDAwMFoXDTQ2MDgyMjE5MDAxNFowTzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIElu\n"
"dGVybmV0IFNlY3VyaXR5IERldmVsb3BtZW50IEdyb3VwMRUwEwYDVQQDEwxJU0NH\n"
" IFJvb3QgWDEwggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwCAgKAgEAz2WgW64gN8a3\n"
"y2z9CoH48Z033pG16V9TfJm62gE4mC+2uKMT6vS518c0Z4MInZgX62u+m9tFtwv9\n"
"Tq9S3HqM1T9vWnI50HxtS6Y4eT6qB89tWn66hP_SOME_ROOT_PEM_PLACEHOLDER\n"
"-----END CERTIFICATE-----\n";

ThingSpeakClient::ThingSpeakClient() {
  last_upload_ms = 0;
  upload_latency_ms = 0;
  upload_retry_count = 0;
}

void ThingSpeakClient::initialize() {
#if TEST_MODE
  // Bypass SSL TLS check in basic sandbox development setups
  secure_client.setInsecure();
  Serial.println("[SSL warning] Encryption set to Insecure for Dev testing.");
#else
  // Secure TLS validation (Subject: Networks Security Cert Pinning)
  secure_client.setCACert(THINGSPEAK_ROOT_CA);
  Serial.println("[SSL info] Secure ThingSpeak Certificate Registry loaded.");
#endif
}

bool ThingSpeakClient::upload(const SensorReadings& raw, const NormalizedValues& norm, SystemState state, const AlertFlags& alerts) {
  unsigned long start_time_ms = millis();
  
  if (!shouldUpload(5000)) { // Safety guard against double-uploading within 15 seconds
    return false;
  }

  Serial.println("[ThingSpeak Tx] Initializing Secure TLS upload request...");
  
  if (!secure_client.connect(THINGSPEAK_SERVER, THINGSPEAK_PORT)) {
    upload_retry_count++;
    Serial.println("[ThingSpeak Tx] TLS Handshake Connection Failure.");
    return false;
  }

  // Build HTTP POST string with 8 specific fields mapping directly to Section G2
  String url = "/update?api_key=" + String(THINGSPEAK_WRITE_API_KEY);
  url += "&field1=" + String(raw.cal_temp, 2);
  url += "&field2=" + String(raw.cal_humidity, 2);
  url += "&field3=" + String(raw.ppm_mq2, 1);
  url += "&field4=" + String(raw.pir_debounced);
  url += "&field5=" + String(raw.ldr_normalized, 3);
  url += "&field6=" + String(norm.risk_score, 4);
  url += "&field7=" + String((int)state);
  url += "&field8=" + String(alerts.critical ? 1 : 0);

  // Send standard HTTP GET request to ThingSpeak Endpoint
  secure_client.print(String("GET ") + url + " HTTP/1.1\r\n" +
                      "Host: " + THINGSPEAK_SERVER + "\r\n" +
                      "Connection: close\r\n\r\n");

  // Read response stream
  while(secure_client.connected()) {
    String line = secure_client.readStringUntil('\n');
    if (line == "\r") {
      break;
    }
  }
  String response_body = secure_client.readString();
  secure_client.stop();

  if (response_body.startsWith("0")) {
    Serial.println("[ThingSpeak Tx] Error response: Rejected by server API limit rate.");
    return false;
  }

  // Record metrics
  last_upload_ms = millis();
  upload_latency_ms = millis() - start_time_ms;
  upload_retry_count = 0;
  
  Serial.printf("[ThingSpeak Tx] Successfully updated channel. Network Latency: %lu ms\n", upload_latency_ms);
  return true;
}

bool ThingSpeakClient::shouldUpload(unsigned long fsm_interval) const {
  // ThingSpeak rules strictly enforce a 15-second minimum rate limit between updates
  unsigned long mandated_limit = max(fsm_interval, 15000UL);
  return (millis() - last_upload_ms) >= mandated_limit;
}

unsigned long ThingSpeakClient::getLastUploadLatencyMs() const {
  return upload_latency_ms;
}
