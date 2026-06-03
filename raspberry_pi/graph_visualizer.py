import os
import matplotlib.pyplot as plt
import numpy as np

class GraphVisualizer:
    def __init__(self, output_dir="./smarthome_data/plots/"):
        self.output_dir = output_dir
        
        # Static vertex layouts mapping to physical zones
        self.node_positions = {
            0: (2.0, 2.0), # Living
            1: (4.0, 2.0), # Kitchen
            2: (2.0, 4.0), # Bedroom
            3: (3.0, 3.0), # Hallway
            4: (3.0, 5.0)  # Exterior (Exit)
        }
        self.node_names = {
            0: "Living", 1: "Kitchen", 2: "Bedroom", 3: "Hallway", 4: "Exterior"
        }
        
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

    def draw_live_graph(self, edge_weights, node_risks, bfs_order, dijkstra_path, save_filename="graph_live.png"):
        """
        edge_weights: dict matching {(u, v): weight, ...}
        node_risks: list of size 5 containing float scores [0.0, 1.0]
        bfs_order: list representing traversal visit indices
        dijkstra_path: list representing safest escape route sequence
        """
        plt.figure(figsize=(7, 6))
        ax = plt.gca()
        ax.set_facecolor("#0b0f19") # Dark slate background for premium high-contrast theme
        plt.gcf().patch.set_facecolor("#0b0f19")
        
        # Draw edges
        for (u, v), w in edge_weights.items():
            if u not in self.node_positions or v not in self.node_positions: continue
            x1, y1 = self.node_positions[u]
            x2, y2 = self.node_positions[v]
            
            # Determine tone mapping
            if w < 0.35:
                color = "#10b981" # safe emerald green
                lw = 1.5
            elif w < 0.65:
                color = "#fbbf24" # warning amber yellow
                lw = 2.5
            else:
                color = "#ef4444" # active hot red
                lw = 4.0
                
            # Thick highlights if part of Dijkstra path
            is_in_dijkstra = False
            for i in range(len(dijkstra_path) - 1):
                if (dijkstra_path[i] == u and dijkstra_path[i+1] == v) or (dijkstra_path[i] == v and dijkstra_path[i+1] == u):
                    is_in_dijkstra = True
                    break
                    
            if is_in_dijkstra:
                # Safest route thick glowing underline
                plt.plot([x1, x2], [y1, y2], color="#3b82f6", lw=7, alpha=0.35, zorder=1) # glowing blue buffer
                plt.plot([x1, x2], [y1, y2], color="#60a5fa", lw=3.0, zorder=2) # radiant core
            else:
                plt.plot([x1, x2], [y1, y2], color=color, lw=lw, linestyle="-", zorder=1, alpha=0.8)
                
            # Print physical cost labels at the center points of the edges
            mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            plt.text(mx, my, f"w:{w:.2f}", color="#94a3b8", fontsize=8,
                     bbox=dict(facecolor='#1e293b', alpha=0.9, edgecolor='none', boxstyle='round,pad=0.2'),
                     ha='center', va='center', zorder=4)

        # Draw nodes
        for u, (x, y) in self.node_positions.items():
            r = node_risks[u] if u < len(node_risks) else 0.1
            
            # Risk color indicators
            if r < 0.20:
                node_color = "#1e40af" # Slate Blue (Secure baseline)
            elif r < 0.40:
                node_color = "#065f46" # Deep Green (Monitor)
            elif r < 0.65:
                node_color = "#854d0e" # Dark Golden Amber
            elif r < 0.85:
                node_color = "#9a3412" # Fiery Orange
            else:
                node_color = "#991b1b" # Blood Red (Active fire/gas)

            # Draw circle
            circle = plt.Circle((x, y), 0.26, color=node_color, ec='#f8fafc', lw=1.5, zorder=3)
            ax.add_patch(circle)
            
            # Print BFS sequence index order
            bfs_seq_num = ""
            if u in bfs_order:
                bfs_seq_num = f" #{bfs_order.index(u)+1}"
            
            # Print labels
            plt.text(x, y + 0.35, f"{self.node_names[u]}{bfs_seq_num}", color="#f8fafc", fontsize=9, fontweight="bold", ha='center', va='center')
            plt.text(x, y, f"R:{r:.2f}", color="#f8fafc", fontsize=8, ha='center', va='center', zorder=5)

        plt.title("Dynamic Sensor-Risk Graph G=(V,E,W(t)) — Live Evacuation Overlay", color="#f8fafc", fontsize=11, pad=15)
        plt.xlim(1.2, 4.8)
        plt.ylim(1.2, 5.8)
        plt.axis('off')
        
        save_path = os.path.join(self.output_dir, save_filename)
        plt.tight_layout()
        plt.savefig(save_path, facecolor="#0b0f19")
        plt.close()
        # logger.info(f"[Graph Visualization] Saved live frame snapshot: {save_path}")
