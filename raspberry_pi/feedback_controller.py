import time
import requests
import logging

logger = logging.getLogger("FeedbackController")

class FeedbackController:
    def __init__(self, esp32_ip="192.168.1.50", port=80, endpoint="/feedback"):
        self.url = f"http://{esp32_ip}:{port}{endpoint}"
        self.sent_count = 0
        self.success_count = 0
        self.failed_count = 0
        self.rtt_timings = []

    def trigger_feedback_escalation(self, reason="cloud_anomaly", score=3.2):
        self.sent_count += 1
        
        payload = {
            "command": "ESCALATE",
            "reason": reason,
            "z_score": float(score)
        }
        headers = {"Content-Type": "application/json"}
        
        logger.info(f"[Feedback Loop] Initiating active escalation command to ESP32: {self.url}...")
        t0 = time.time()
        
        # Retry loop logic
        max_retries = 3
        success = False
        
        for attempt in range(max_retries):
            try:
                response = requests.post(self.url, json=payload, headers=headers, timeout=2.0)
                
                if response.status_code == 200:
                    rtt = (time.time() - t0) * 1000.0 # to ms
                    self.rtt_timings.append(rtt)
                    self.success_count += 1
                    success = True
                    logger.info(f"[Feedback Loop] Success! ESP32 Acknowledged. RTT: {rtt:.2f} ms")
                    break
                else:
                    logger.warning(f"[Feedback Loop] Attempt {attempt+1} failed: HTTP Code: {response.status_code}")
                    
            except requests.exceptions.RequestException as ex:
                logger.warning(f"[Feedback Loop] Attempt {attempt+1} Error: {ex}")
                
            time.sleep(2.0) # 2-second backoff between retries

        if not success:
            self.failed_count += 1
            logger.error(f"[Feedback Loop] Fatal: Escalation feedback command delivery permanently failed after {max_retries} attempts.")
            return False
            
        return True

    def get_performance_stats(self):
        mean_rtt = (sum(self.rtt_timings) / len(self.rtt_timings)) if self.rtt_timings else 0.0
        return {
            "total_sent": self.sent_count,
            "successful_handshakes": self.success_count,
            "failed_handshakes": self.failed_count,
            "mean_rtt_latency_ms": mean_rtt
        }
