/**
 * =========================================================================
 * Smart Home Monitoring System — BFS Traversal Algorithm (bfs_algorithm.cpp)
 * =========================================================================
 */

#include "bfs_algorithm.h"

BFSAlgorithm::BFSAlgorithm() {
  q_head = 0;
  q_tail = 0;
  q_size = 0;
}

void BFSAlgorithm::enqueue(int v) {
  if (q_size < NUM_ZONES) {
    queue[q_tail] = v;
    q_tail = (q_tail + 1) % NUM_ZONES;
    q_size++;
  }
}

int BFSAlgorithm::dequeue() {
  if (q_size > 0) {
    int v = queue[q_head];
    q_head = (q_head + 1) % NUM_ZONES;
    q_size--;
    return v;
  }
  return -1;
}

bool BFSAlgorithm::isEmpty() const {
  return q_size == 0;
}

BFSResult BFSAlgorithm::run(const GraphEngine& graph, int source) {
  unsigned long start_time_us = micros();
  BFSResult result;
  result.n_visited = 0;

  VertexColor color[NUM_ZONES];

  for (int i = 0; i < NUM_ZONES; i++) {
    color[i] = COLOR_WHITE;
    result.hop_distance[i] = 999;
    result.parent[i] = -1;
    result.order[i] = -1;
  }

  // Set initial source characteristics
  color[source] = COLOR_GRAY;
  result.hop_distance[source] = 0;
  result.parent[source] = -1;
  
  q_head = 0;
  q_tail = 0;
  q_size = 0;
  enqueue(source);

  int visit_idx = 0;
  while (!isEmpty()) {
    int u = dequeue();
    result.order[visit_idx++] = u;

    // Explore neighbors
    for (int v = 0; v < NUM_ZONES; v++) {
      if (graph.hasEdge(u, v) && color[v] == COLOR_WHITE) {
        color[v] = COLOR_GRAY;
        result.hop_distance[v] = result.hop_distance[u] + 1;
        result.parent[v] = u;
        enqueue(v);
      }
    }
    color[u] = COLOR_BLACK;
  }

  result.n_visited = visit_idx;
  result.execution_time_us = micros() - start_time_us;
  return result;
}

void BFSAlgorithm::triggerGraduatedAlert(const BFSResult& result) {
  Serial.println(">>> PROPAGATING GRADUATED WARNING ALERTS (BFS MODULATION) <<<");
  for (int i = 0; i < result.n_visited; i++) {
    int u = result.order[i];
    int hops = result.hop_distance[u];
    
    const char* color_level = "WHITE";
    const char* flag = "IDLE";
    if (hops == 0) {
      color_level = "RED"; 
      flag = "HOST ZONE TRIGGER (URGENT CRITICAL WARNING ACTIVE)";
    } else if (hops == 1) {
      color_level = "ORANGE";
      flag = "ADJACENT COLLATERAL SAFETY WARNING PREPARE";
    } else if (hops >= 2) {
      color_level = "YELLOW";
      flag = "ROUTINE SECTOR AWARE ACTION ENFORCED";
    }
    
    Serial.printf(" - Hop-Distance Level %d: Node idx: %d | Threat level: %s | Action: %s\n", 
                  hops, u, color_level, flag);
  }
  Serial.println("---------------------------------------------------------------");
}

void BFSAlgorithm::printBFSTree(const BFSResult& result, const GraphEngine& graph) const {
  Serial.println("================= BFS PROPAGATION TREE ==================");
  Serial.printf("Source node Anchor: %s | Hops trace:\n", graph.getZone(result.order[0]).name);
  for (int i = 0; i < NUM_ZONES; i++) {
    int parent_idx = result.parent[i];
    const char* p_name = (parent_idx != -1) ? graph.getZone(parent_idx).name : "NONE (ROOT)";
    Serial.printf("  Zone [%8s] -> Parents: [%8s] | Min-Hop span index: %d\n",
                  graph.getZone(i).name, p_name, result.hop_distance[i]);
  }
  Serial.printf("Total Vertices Discovered: %d | Hops Execution Time: %lu us\n",
                result.n_visited, result.execution_time_us);
  Serial.println("=========================================================");
}
