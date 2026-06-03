import os
import csv
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger("DatasetRecorder")

class DatasetRecorder:
    def __init__(self, directory="./smarthome_data/datasets/", prefix="smarthome_telemetry", rotation_hours=24):
        self.directory = directory
        self.prefix = prefix
        self.rotation_hours = rotation_hours
        self.current_filename = ""
        self.last_rotation_time = datetime.now()
        self.active_anomaly_label = 0
        
        self.headers = [
            "timestamp", "temperature", "humidity", "mq2_ppm", "pir", "ldr",
            "risk_score", "fsm_state", "alert_flag", "anomaly_label", "sequence_number",
            "n_T", "n_S", "n_P", "n_H", "n_L"
        ]

        # Create output dirs if not exist
        if not os.path.exists(self.directory):
            os.makedirs(self.directory)
            
        self._rotate_file_if_needed(force=True)

    def set_anomaly_label(self, label):
        self.active_anomaly_label = int(label)

    def _rotate_file_if_needed(self, force=False):
        now = datetime.now()
        duration = now - self.last_rotation_time
        
        if force or duration >= timedelta(hours=self.rotation_hours) or not self.current_filename:
            time_str = now.strftime("%Y%m%d_%H%M%S")
            self.current_filename = os.path.join(self.directory, f"{self.prefix}_{time_str}.csv")
            self.last_rotation_time = now
            
            # Write column headers in the rotated file
            write_headers = not os.path.exists(self.current_filename)
            if write_headers:
                with open(self.current_filename, mode='w', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(self.headers)
            logger.info(f"Dataset file rotated. Active log target: {self.current_filename}")

    def on_sensor_received(self, topic, data):
        self._rotate_file_if_needed()
        
        # Schema verification & extraction and rejection mapping
        try:
            timestamp = datetime.now().isoformat()
            
            # Extract structures
            sensors = data.get("sensors", {})
            alerts = data.get("alerts", {})
            risk = data.get("risk", 0.0)
            state = data.get("state", "IDLE")
            seq = data.get("sensors", {}).get("seq", 0) # Use nested sequence number
            
            # Parse metrics
            temp = float(sensors.get("t_cal", 0.0))
            hum = float(sensors.get("h_cal", 0.0))
            gas = float(sensors.get("gas_ppm", 0.0))
            pir = int(sensors.get("pir_deb", 0))
            ldr = float(sensors.get("ldr_norm", 0.0))
            
            # Reconstruct normalized metrics
            n_T = min(max((temp - 20.0) / 25.0, 0.0), 1.0)
            n_S = min(max(gas / 1000.0, 0.0), 1.0)
            n_P = float(pir)
            n_H = min(max(1.0 - (hum / 100.0), 0.0), 1.0)
            n_L = min(max(1.0 - ldr, 0.0), 1.0)
            
            alert_active = 1 if alerts.get("critical", 0) else 0

            row = [
                timestamp, temp, hum, gas, pir, ldr,
                risk, state, alert_active, self.active_anomaly_label, seq,
                n_T, n_S, n_P, n_H, n_L
            ]

            # Atomic file append write
            with open(self.current_filename, mode='a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(row)
                
        except (ValueError, TypeError) as ex:
            logger.error(f"Rejected malformed telemetry dataset record: {ex}")

    def compute_and_save_hourly_stats(self):
        # Calculate summaries over current CSV file using Python tools
        if not os.path.exists(self.current_filename): return
        
        records = []
        with open(self.current_filename, mode='r') as f:
            reader = csv.DictReader(f)
            for r in reader:
                records.append(r)

        if not records: return

        count = len(records)
        anomalies = sum(1 for r in records if int(r["anomaly_label"]) > 0)
        
        temps = [float(r["temperature"]) for r in records]
        gases = [float(r["mq2_ppm"]) for r in records]
        risks = [float(r["risk_score"]) for r in records]

        stats = {
            "calculation_time": datetime.now().isoformat(),
            "total_records": count,
            "anomaly_records": anomalies,
            "metrics": {
                "temperature": {"mean": sum(temps)/count, "max": max(temps), "min": min(temps)},
                "gas_ppm": {"mean": sum(gases)/count, "max": max(gases), "min": min(gases)},
                "risk_score": {"mean": sum(risks)/count, "max": max(risks), "min": min(risks)}
            }
        }

        stats_filepath = self.current_filename.replace(".csv", "_stats.json")
        with open(stats_filepath, 'w') as f:
            json.dump(stats, f, indent=2)
        logger.info(f"Hourly dataset audit statistics saved in {stats_filepath}")
