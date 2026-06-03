import time
import logging
import numpy as np
from collections import deque

logger = logging.getLogger("AnomalyDetector")

class AnomalyDetector:
    def __init__(self, window_size=60, z_threshold=2.5, rate_threshold=0.15):
        self.window_size = window_size
        self.z_threshold = z_threshold
        self.rate_threshold = rate_threshold
        
        # Sliding history queues
        self.risk_history = deque(maxlen=window_size)
        self.sensor_histories = {
            "temp": deque(maxlen=window_size),
            "humidity": deque(maxlen=window_size),
            "gas": deque(maxlen=window_size)
        }
        
        self.last_timestamps = {}
        self.anomaly_events_queue = []
        self.hourly_means = []
        self.hourly_stds = []
        self.last_baseline_update = time.time()
        
        # Performance telemetry audits
        self.cloud_fp_count = 0
        self.drift_events_found = 0

    def feed_data(self, topic, data):
        if topic != "home/sensors/raw": return
        
        now = time.time()
        sensors = data.get("sensors", {})
        risk_score = float(data.get("risk", 0.0))
        
        temp = float(sensors.get("t_cal", 25.0))
        hum = float(sensors.get("h_cal", 40.0))
        gas = float(sensors.get("gas_ppm", 100.0))

        # Check rate of change
        self._detect_rate_of_change("risk_score", risk_score, now)
        self._detect_rate_of_change("temp", temp, now)
        
        # Add to window buffers
        self.risk_history.append(risk_score)
        self.sensor_histories["temp"].append(temp)
        self.sensor_histories["humidity"].append(hum)
        self.sensor_histories["gas"].append(gas)

        self.last_timestamps["risk_score"] = now
        self.last_timestamps["temp"] = now

        # Perform statistical Z-Score tests
        if len(self.risk_history) >= 15: // Require minimal statistical density
            mean_R = np.mean(self.risk_history)
            std_R = np.std(self.risk_history)
            
            if std_R < 0.001: std_R = 0.001 # division safety
            
            z_score = (risk_score - mean_R) / std_R
            
            if abs(z_score) > self.z_threshold:
                # If Z-score shifts slowly without triggering immediate physical locks, it is a slow drift!
                is_slow_drift = abs(z_score) > self.z_threshold and risk_score < 0.70
                event_type = "slow_drift" if is_slow_drift else "spike"
                
                if is_slow_drift:
                    self.drift_events_found += 1
                
                event = {
                    "timestamp": datetime_string_now(),
                    "sensor": "risk_score",
                    "z_score": float(z_score),
                    "value": risk_score,
                    "type": event_type,
                    "mean": float(mean_R),
                    "std": float(std_R)
                }
                
                self.anomaly_events_queue.append(event)
                logger.warning(f"[Anomaly Event] {event_type.upper()} on risk: current={risk_score:.3f} | Z={z_score:.2f} (Limits: {mean_R:.3f}+-{self.z_threshold*std_R:.3f})")

        # Periodically update baseline stats
        if now - self.last_baseline_update >= 3600:
            self._update_adaptive_baseline()
            self.last_baseline_update = now

    def _detect_rate_of_change(self, sensor_name, current_val, now):
        prev_time = self.last_timestamps.get(sensor_name)
        if prev_time is None: return

        elapsed_mins = (now - prev_time) / 60.0
        if elapsed_mins < 0.01: return # Avoid divide-by-zero bounds

        history_list = self.risk_history if sensor_name == "risk_score" else self.sensor_histories["temp"]
        if not history_list: return
        
        prev_val = history_list[-1]
        rate = (current_val - prev_val) / elapsed_mins

        if abs(rate) > self.rate_threshold:
            event = {
                "timestamp": datetime_string_now(),
                "sensor": sensor_name,
                "z_score": 0.0,
                "value": current_val,
                "type": "rate_anomaly",
                "rate": float(rate)
            }
            self.anomaly_events_queue.append(event)
            logger.warning(f"[Anomaly Area] Symmetrical change rate limit breached for {sensor_name}: {rate:.3f} units/min.")

    def _update_adaptive_baseline(self):
        if len(self.risk_history) > 10:
            self.hourly_means.append(np.mean(self.risk_history))
            self.hourly_stds.append(np.std(self.risk_history))
            logger.info(f"[Adaptive Limit] Baseline statistics shifted: Mean={self.hourly_means[-1]:.3f}, SD={self.hourly_stds[-1]:.3f}")

    def get_latest_anomalies(self):
        events = list(self.anomaly_events_queue)
        self.anomaly_events_queue.clear()
        return events

def datetime_string_now():
    from datetime import datetime
    return datetime.now().isoformat()
