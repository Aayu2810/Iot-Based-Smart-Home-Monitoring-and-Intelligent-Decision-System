"""
=========================================================================
Smart Home Monitoring System — ThingSpeak Client (thingspeak_client.py)
=========================================================================
"""

import os
import time
import requests
import logging

# Load .env — search the same locations as main_coordinator.py uses.
# edge_algorithms/ is one level below raspberry_pi/, so "../.env" = raspberry_pi/.env (Pi).
# "../../.env" = project root (dev machine).  override=False so main_coordinator's
# earlier load_dotenv is not clobbered.
try:
    from dotenv import load_dotenv
    _here = os.path.dirname(os.path.abspath(__file__))
    for _candidate in (
        os.path.join(_here, "..", ".env"),        # raspberry_pi/.env  ← Pi deployment
        os.path.join(_here, "..", "..", ".env"),  # project-root/.env  ← dev machine
    ):
        if os.path.isfile(_candidate):
            load_dotenv(dotenv_path=os.path.abspath(_candidate), override=False)
            break
except ImportError:
    pass

logger = logging.getLogger("ThingSpeakClient")

THINGSPEAK_SERVER = "https://api.thingspeak.com"
THINGSPEAK_WRITE_API_KEY = "YOUR_API_KEY"

class ThingSpeakClient:
    def __init__(self):
        self.last_upload_ms = 0
        self.upload_latency_ms = 0
        self.upload_retry_count = 0
        self.is_initialized = False
        self.api_key = None

    def initialize(self, api_key=None):
        global THINGSPEAK_WRITE_API_KEY
        placeholder_keys = (
            "YOUR_API_KEY", "YOUR_WRITE_KEY", "YOUR_READ_KEY",
            "REPLACE_WITH_YOUR_THINGSPEAK_WRITE_API_KEY",
            "REPLACE_WITH_YOUR_THINGSPEAK_READ_API_KEY",
            "",
        )
        # Prefer the environment variable; fall back to the caller-supplied key
        env_key = os.getenv("THINGSPEAK_WRITE_API_KEY", "")
        resolved = env_key if env_key and env_key not in placeholder_keys else (api_key or "")

        if resolved and resolved not in placeholder_keys:
            THINGSPEAK_WRITE_API_KEY = resolved
            self.api_key = resolved
            self.is_initialized = True
            logger.info(f"[ThingSpeak] Initialized with API key: {resolved[:4]}...{resolved[-4:]}")
        else:
            self.is_initialized = False
            logger.warning("[ThingSpeak] Initialization skipped — set THINGSPEAK_WRITE_API_KEY in .env")

    def should_upload(self, fsm_interval_ms: int) -> bool:
        """
        ThingSpeak rules strictly enforce a 15-second minimum rate limit between updates.
        """
        mandated_limit = max(fsm_interval_ms, 15000)
        current_ms = int(time.time() * 1000)
        return (current_ms - self.last_upload_ms) >= mandated_limit

    def upload(self, raw, norm, state: int, alerts) -> bool:
        # Check if properly initialized
        if not self.is_initialized:
            logger.debug("[ThingSpeak Tx] Skipped - client not initialized with valid API key")
            return False

        if not self.should_upload(5000):
            return False

        logger.info("[ThingSpeak Tx] Initiating secure HTTPS upload...")
        
        start_time_ms = int(time.time() * 1000)
        
        # Determine critical alert flag
        # If alerts is a dict or similar, extract the 'critical' field.
        # Handling depending on how it's passed from main_coordinator
        is_critical = alerts.get("critical", False) if isinstance(alerts, dict) else getattr(alerts, "critical", False)

        payload = {
            "api_key": THINGSPEAK_WRITE_API_KEY,
            "field1": f"{raw.cal_temp:.2f}",
            "field2": f"{raw.cal_humidity:.2f}",
            "field3": f"{raw.ppm_mq2:.1f}",
            "field4": f"{raw.pir_debounced}",
            "field5": f"{raw.ldr_normalized:.3f}",
            "field6": f"{norm.risk_score:.4f}",
            "field7": str(int(state)),
            "field8": "1" if is_critical else "0"
        }

        try:
            response = requests.get(f"{THINGSPEAK_SERVER}/update", params=payload, timeout=10)
            response.raise_for_status()
            response_text = response.text.strip()
            
            if response_text == "0":
                logger.warning("[ThingSpeak Tx] Error response: Rejected by server API limit rate.")
                return False
                
            self.last_upload_ms = int(time.time() * 1000)
            self.upload_latency_ms = self.last_upload_ms - start_time_ms
            self.upload_retry_count = 0
            
            logger.info(f"[ThingSpeak Tx] Successfully updated channel. Network Latency: {self.upload_latency_ms} ms")
            return True
            
        except requests.exceptions.RequestException as e:
            self.upload_retry_count += 1
            logger.error(f"[ThingSpeak Tx] TLS Handshake Connection Failure or Timeout: {e}")
            return False

    def get_last_upload_latency_ms(self) -> int:
        return self.upload_latency_ms
