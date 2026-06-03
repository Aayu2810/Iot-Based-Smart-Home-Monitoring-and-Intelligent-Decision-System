import numpy as np
import scipy.stats as stats
import matplotlib.pyplot as plt
import seaborn as sns

class StatisticalAnalyzer:
    def __init__(self):
        pass

    @staticmethod
    def compute_confusion_matrix(predictions, labels):
        # predictions, labels must be array-likes containing 0s (negative) or 1s (positive)
        preds = np.array(predictions, dtype=int)
        labs = np.array(labels, dtype=int)
        
        tp = int(np.sum((preds == 1) & (labs == 1)))
        tn = int(np.sum((preds == 0) & (labs == 0)))
        fp = int(np.sum((preds == 1) & (labs == 0)))
        fn = int(np.sum((preds == 0) & (labs == 1)))
        
        return {"TP": tp, "FP": fp, "TN": tn, "FN": fn}

    @staticmethod
    def compute_fpr_fnr(cm):
        tp, fp, tn, fn = cm["TP"], cm["FP"], cm["TN"], cm["FN"]
        
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
        
        return {"FPR": fpr, "FNR": fnr}

    @staticmethod
    def compute_roc_curve(scores, labels):
        scores = np.array(scores, dtype=float)
        labels = np.array(labels, dtype=int)
        
        thresholds = np.arange(0.0, 1.01, 0.01)
        fpr_array = []
        tpr_array = []
        
        for t in thresholds:
            preds = (scores >= t).astype(int)
            cm = StatisticalAnalyzer.compute_confusion_matrix(preds, labels)
            
            tp, fp, tn, fn = cm["TP"], cm["FP"], cm["TN"], cm["FN"]
            
            fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
            tpr = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            
            fpr_array.append(fpr)
            tpr_array.append(tpr)
            
        return np.array(fpr_array), np.array(tpr_array), thresholds

    @staticmethod
    def compute_auc(fpr, tpr):
        # Computes area under the curve using trapezoidal integration rules (sorting FPR first)
        sorted_indices = np.argsort(fpr)
        sorted_fpr = fpr[sorted_indices]
        sorted_tpr = tpr[sorted_indices]
        return float(np.trapz(sorted_tpr, sorted_fpr))

    @staticmethod
    def find_optimal_threshold(fpr_array, fnr_array, thresholds, lambda1=0.3, lambda2=0.7):
        # cost = lambda1 * fpr + lambda2 * fnr
        costs = lambda1 * fpr_array + lambda2 * fnr_array
        opt_idx = np.argmin(costs)
        return float(thresholds[opt_idx]), float(costs[opt_idx])

    @staticmethod
    def paired_ttest(proposed_scores, baseline_scores):
        a = np.array(proposed_scores, dtype=float)
        b = np.array(baseline_scores, dtype=float)
        
        t_stat, p_val = stats.ttest_rel(a, b)
        df = len(a) - 1
        
        return {"t_stat": float(t_stat), "p_value": float(p_val), "df": df}

    @staticmethod
    def cohens_d(a, b):
        arr_a = np.array(a, dtype=float)
        arr_b = np.array(b, dtype=float)
        
        n_a, n_b = len(arr_a), len(arr_b)
        var_a, var_b = np.var(arr_a, ddof=1), np.var(arr_b, ddof=1)
        mean_a, mean_b = np.mean(arr_a), np.mean(arr_b)
        
        pooled_std = np.sqrt(((n_a - 1) * var_a + (n_b - 1) * var_b) / (n_a + n_b - 2))
        d = (mean_a - mean_b) / pooled_std if pooled_std > 0 else 0.0
        return float(d)

    @staticmethod
    def bonferroni_correction(p_values, n_comparisons=18):
        corrected_threshold = 0.05 / n_comparisons
        results = [float(p) < corrected_threshold for p in p_values]
        return corrected_threshold, results

    @staticmethod
    def generate_comparison_table(proposed_metrics, baseline_metrics):
        print("\n=================== SYSTEM DEVIATION PERFORMANCE COMP ===================")
        print(" Metric Category           | Proposed Fusion  | Baseline Threshold | Reduction ")
        print("---------------------------+------------------+--------------------+-----------")
        categories = ["False Positive Rate", "False Negative Rate", "AUC (Risk Curve)", "Crit Delay (ms)"]
        
        for cat in categories:
            p_val = proposed_metrics.get(cat, 0.0)
            b_val = baseline_metrics.get(cat, 0.0)
            
            delta = b_val - p_val
            pct = (delta / b_val * 100.0) if b_val > 0 else 0.0
            
            print(f" {cat:<25} | {p_val:16.4f} | {b_val:18.4f} | {pct:7.1f}%")
        print("=========================================================================\n")

    @staticmethod
    def plot_roc_curve(fpr, tpr, auc, save_path="./smarthome_data/plots/roc.png"):
        plt.figure(figsize=(6, 5))
        plt.plot(fpr, tpr, color='forestgreen', lw=2, label=f'Proposed Fusion (AUC = {auc:.3f})')
        plt.plot([0, 1], [0, 1], color='grey', linestyle='--')
        plt.xlim([0.0, 1.0])
        plt.ylim([0.0, 1.05])
        plt.xlabel('False Positive Rate (FPR)')
        plt.ylabel('True Positive Rate (TPR)')
        plt.title('Receiver Operating Characteristic (ROC)')
        plt.legend(loc="lower right")
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        plt.savefig(save_path)
        plt.close()

    @staticmethod
    def plot_confusion_matrix(cm, save_path="./smarthome_data/plots/cm.png"):
        matrix = [
            [cm["TN"], cm["FP"]],
            [cm["FN"], cm["TP"]]
        ]
        plt.figure(figsize=(5, 4))
        sns.heatmap(matrix, annot=True, fmt="d", cmap="Greens", cbar=False,
                    xticklabels=["Normal", "Hazard"], yticklabels=["Normal", "Hazard"])
        plt.xlabel('Predicted Label')
        plt.ylabel('True Label')
        plt.title('System Confusion Matrix')
        plt.tight_layout()
        plt.savefig(save_path)
        plt.close()

    @staticmethod
    def plot_latency_distribution(proposed_latencies, baseline_latencies, save_path="./smarthome_data/plots/lat_dist.png"):
        plt.figure(figsize=(7, 4.5))
        plt.hist(proposed_latencies, bins=15, alpha=0.6, color='emerald', label='Primary Max-Heap PQ')
        plt.hist(baseline_latencies, bins=15, alpha=0.4, color='orange', label='Secondary FIFO Queue')
        plt.xlabel('Transmission Latency (ms)')
        plt.ylabel('Message Frequency Count')
        plt.title('MQTT Alarm Handshake Latency Distributions')
        plt.legend(loc="upper right")
        plt.grid(True, alpha=0.2)
        plt.tight_layout()
        plt.savefig(save_path)
        plt.close()
