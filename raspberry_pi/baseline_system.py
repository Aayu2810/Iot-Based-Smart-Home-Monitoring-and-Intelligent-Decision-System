import numpy as np

class BaselineSystem:
    def __init__(self, single_threshold_T=35.0, single_threshold_ppm=500.0):
        self.single_threshold_T = single_threshold_T
        self.single_threshold_ppm = single_threshold_ppm

    def evaluate_baseline(self, sensor_readings):
        """
        sensor_readings: dict or object containing keys:
        - temperature
        - mq2_ppm
        - pir
        - ldr (normalized)
        """
        temp = float(sensor_readings.get("temperature", 0.0))
        gas = float(sensor_readings.get("mq2_ppm", 0.0))
        pir = int(sensor_readings.get("pir", 0))
        ldr = float(sensor_readings.get("ldr", 1.0)) # 0 is bright, 1 is dark

        # Simple threshold comparisons
        if temp > self.single_threshold_T: return 1
        if gas > self.single_threshold_ppm: return 1
        if pir == 1: return 1
        if ldr > 0.7: return 1 # Equivalent to dark trigger

        return 0 # Normal

    def simulate_fifo_delivery(self, message_list, transmission_delay_base_ms=10.0):
        """
        Simulates FIFO queue delivery where order is strictly sequential (flat channel delays).
        """
        results = []
        current_clock_ms = 0.0
        for i, msg in enumerate(message_list):
            priority = msg.get("priority", 0)
            
            # Simple simulation: FIFO queue blocks during transmission channel wait.
            # Rutinary traffic delays critical alarms because there is no bypass.
            jitter = 5.0 * np.random.randn()
            delay = transmission_delay_base_ms + abs(jitter)
            
            if priority == 3: # In a FIFO, critical message might be stuck at position i
                queue_head_penalty = i * 40.0 # Standard network queue wait penalty
                delay += queue_head_penalty
                
            current_clock_ms += delay
            results.append(current_clock_ms)
        return results

    def compute_baseline_fpr_fnr(self, sensor_dataset, labels):
        # Sweeps all records in a dataset comparison
        predictions = []
        for r in sensor_dataset:
            pred = self.evaluate_baseline(r)
            predictions.append(pred)

        preds = np.array(predictions)
        labs = np.array(labels)
        
        tp = np.sum((preds == 1) & (labs == 1))
        tn = np.sum((preds == 0) & (labs == 0))
        fp = np.sum((preds == 1) & (labs == 0))
        fn = np.sum((preds == 0) & (labs == 1))

        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0

        return {
            "confusion_matrix": {"TP": int(tp), "FP": int(fp), "TN": int(tn), "FN": int(fn)},
            "FPR": float(fpr),
            "FNR": float(fnr)
        }
