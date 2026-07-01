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
            time_str = now.strftime("%d%m%Y")
            self.current_filename = os.path.join(self.directory, f"{self.prefix}_{time_str}.csv")
            self.last_rotation_time = now
            
            # Write column headers in the rotated file
            write_headers = not os.path.exists(self.current_filename)
            if write_headers:
                with open(self.current_filename, mode='w', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow(self.headers)
            logger.info(f"Dataset file rotated. Active log target: {self.current_filename}")

    def record_data(self, raw, norm, state_name, is_critical, seq=0):
        self._rotate_file_if_needed()
        
        try:
            timestamp = datetime.now().isoformat()
            
            # Reconstruct normalized metrics using actual NormalizedValues attributes
            # NormalizedValues class uses: n_T, n_S, n_P, n_H, n_L
            n_T = norm.n_T if hasattr(norm, 'n_T') else 0.0
            n_S = norm.n_S if hasattr(norm, 'n_S') else 0.0
            n_P = norm.n_P if hasattr(norm, 'n_P') else 0.0
            n_H = norm.n_H if hasattr(norm, 'n_H') else 0.0
            n_L = norm.n_L if hasattr(norm, 'n_L') else 0.0
            
            alert_active = 1 if is_critical else 0

            row = [
                timestamp, raw.cal_temp, raw.cal_humidity, raw.ppm_mq2, raw.pir_debounced, raw.ldr_normalized,
                norm.risk_score, state_name, alert_active, self.active_anomaly_label, seq,
                n_T, n_S, n_P, n_H, n_L
            ]

            # Atomic file append write
            with open(self.current_filename, mode='a', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(row)
                
        except Exception as ex:
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
