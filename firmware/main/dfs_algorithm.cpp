/**
 * =========================================================================
 * Smart Home Monitoring System — DFS Traversal Algorithm (dfs_algorithm.cpp)
 * =========================================================================
 */

#include "dfs_algorithm.h"

DFSAlgorithm::DFSAlgorithm() {
  time_counter = 0;
}

void DFSAlgorithm::dfsVisit(const GraphEngine& graph, int u, DFSResult& result) {
  color[u] = COLOR_GRAY;
  time_counter++;
  result.discovery_time[u] = time_counter;

  for (int v = 0; v < NUM_ZONES; v++) {
    if (graph.hasEdge(u, v)) {
      if (color[v] == COLOR_WHITE) {
        result.parent[v] = u;
        dfsVisit(graph, v, result);
      } 
      else if (color[v] == COLOR_GRAY && result.parent[u] != v) {
        // Found back-edge (Subject: DMS/DAA cycle loop detection)
        // Avoid duplicate counting backwards
        bool duplicate = false;
        for (int k = 0; k < result.n_back_edges; k++) {
          if ((result.back_edges[k][0] == v && result.back_edges[k][1] == u) ||
              (result.back_edges[k][0] == u && result.back_edges[k][1] == v)) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate && result.n_back_edges < 10) {
          result.back_edges[result.n_back_edges][0] = u;
          result.back_edges[result.n_back_edges][1] = v;
          result.n_back_edges++;
        }
      }
    }
  }

  color[u] = COLOR_BLACK;
  time_counter++;
  result.finish_time[u] = time_counter;
}

DFSResult DFSAlgorithm::run(const GraphEngine& graph, int source) {
  unsigned long start_time_us = micros();
  DFSResult result;
  result.n_back_edges = 0;
  time_counter = 0;

  for (int i = 0; i < NUM_ZONES; i++) {
    color[i] = COLOR_WHITE;
    result.parent[i] = -1;
    result.discovery_time[i] = 0;
    result.finish_time[i] = 0;
    result.evacuation_order[i] = i;
  }

  // Visit source first to prioritize evacuation mapping
  dfsVisit(graph, source, result);

  // Visit rest of nodes if disconnected islands present
  for (int i = 0; i < NUM_ZONES; i++) {
    if (color[i] == COLOR_WHITE) {
      dfsVisit(graph, i, result);
    }
  }

  computeEvacuationOrder(result);

  result.execution_time_us = micros() - start_time_us;
  return result;
}

void DFSAlgorithm::computeEvacuationOrder(DFSResult& result) {
  // Sort evacuation_order array based on ascending order of finish_time
  // Shorthand Bubble Sort since array size is strictly N=5
  for (int i = 0; i < NUM_ZONES - 1; i++) {
    for (int j = 0; j < NUM_ZONES - i - 1; j++) {
      int idx_a = result.evacuation_order[j];
      int idx_b = result.evacuation_order[j+1];
      if (result.finish_time[idx_a] > result.finish_time[idx_b]) {
        int temp = result.evacuation_order[j];
        result.evacuation_order[j] = result.evacuation_order[j+1];
        result.evacuation_order[j+1] = temp;
      }
    }
  }
}

void DFSAlgorithm::identifyCycleTraps(const DFSResult& result, const GraphEngine& graph) const {
  Serial.println(">>> TOXIC GAS CIRCULATION CYCLE TRAPS ANALYSIS <<<");
  if (result.n_back_edges == 0) {
    Serial.println(" - No loop traps detected. Airflow routes are safely acyclic.");
  } else {
    for (int i = 0; i < result.n_back_edges; i++) {
      int u = result.back_edges[i][0];
      int v = result.back_edges[i][1];
      Serial.printf(" - Loop Trap detected on path: [%s] <====> [%s]. Forced ventilation needed here!\n",
                    graph.getZone(u).name, graph.getZone(v).name);
    }
  }
  Serial.println("------------------------------------------------------------------");
}

void DFSAlgorithm::printDFSResults(const DFSResult& result, const GraphEngine& graph) const {
  Serial.println("================== DFS ANOMALY ANALYSIS ===================");
  for (int i = 0; i < NUM_ZONES; i++) {
    int p_idx = result.parent[i];
    const char* p_name = (p_idx != -1) ? graph.getZone(p_idx).name : "NONE";
    Serial.printf("  Zone [%8s] -> Parent: [%8s] | Discovery: %2d / Finish: %2d\n",
                  graph.getZone(i).name, p_name, result.discovery_time[i], result.finish_time[i]);
  }
  
  Serial.print("  Calculated Evacuation Order (Priority ascending finish): ");
  for (int i = 0; i < NUM_ZONES; i++) {
    Serial.printf("%s ", graph.getZone(result.evacuation_order[i]).name);
    if(i < NUM_ZONES - 1) Serial.print("-> ");
  }
  Serial.printf("\n  Exhaustive discovery runtime: %lu us\n", result.execution_time_us);
  Serial.println("=========================================================");
}

void DFSAlgorithm::printComparison(const BFSResult& bfs, const DFSResult& dfs, const GraphEngine& graph) const {
  Serial.println("=========== BFS-PROPAGATION VS DFS-EVACUATION ===========");
  Serial.printf("%-20s %-20s\n", "BFS Alarm Order", "DFS Evacuation Order");
  Serial.printf("%-20s %-20s\n", "----------------", "--------------------");
  for (int i = 0; i < NUM_ZONES; i++) {
    const char* b_name = (bfs.order[i] != -1) ? graph.getZone(bfs.order[i]).name : "---";
    const char* d_name = graph.getZone(dfs.evacuation_order[i]).name;
    Serial.printf("%d: %-17s %d: %-17s\n", i+1, b_name, i+1, d_name);
  }
  Serial.println("=========================================================");
}
