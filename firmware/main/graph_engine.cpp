/**
 * =========================================================================
 * Smart Home Monitoring System — Graph Theory Engine (graph_engine.cpp)
 * =========================================================================
 */

#include "graph_engine.h"

GraphEngine::GraphEngine() {
  last_update_time_us = 0;
  initialize();
}

void GraphEngine::initialize() {
  // Define human labels (Subject: DMS / DAA)
  const char* names[] = {"Living", "Kitchen", "Bedroom", "Hallway", "Exterior"};
  for (int i = 0; i < NUM_ZONES; i++) {
    zones[i].id = i;
    zones[i].name = names[i];
    zones[i].risk_score = 0.1f; // low baseline start
    zones[i].isolated = false;
    for(int s = 0; s < 5; s++) zones[i].sensor_vector[s] = 0.0f;
  }

  // Clear topologies
  for (int i = 0; i < NUM_ZONES; i++) {
    for (int j = 0; j < NUM_ZONES; j++) {
      adjacency[i][j] = false;
      distances[i][j] = 0.0f;
      weights[i][j] = 0.5f;
    }
  }

  // Set Static Adjacency & Distance Metrics from section C2
  adjacency[0][1] = adjacency[1][0] = true; distances[0][1] = distances[1][0] = 0.30f;
  adjacency[0][2] = adjacency[2][0] = true; distances[0][2] = distances[2][0] = 0.40f;
  adjacency[0][3] = adjacency[3][0] = true; distances[0][3] = distances[3][0] = 0.25f;
  adjacency[1][3] = adjacency[3][1] = true; distances[1][3] = distances[3][1] = 0.20f;
  adjacency[2][3] = adjacency[3][2] = true; distances[2][3] = distances[3][2] = 0.20f;
  adjacency[3][4] = adjacency[4][3] = true; distances[3][4] = distances[4][3] = 0.35f;
}

void GraphEngine::updateRiskScores(float R_current) {
  // In single node ESP32 setup, environment status is mapped globally
  for (int i = 0; i < NUM_ZONES; i++) {
    zones[i].risk_score = R_current;
  }
}

float GraphEngine::computeEdgeWeight(int i, int j, const float risk_scores[]) {
  // 1. Mean safety risk across edges
  float R_bar = (risk_scores[i] + risk_scores[j]) / 2.0f;
  
  // 2. Linear floor layout layout distance
  float d_ij = distances[i][j];

  // 3. Transition potential (probability metric) W_edge = α R_bar + β d_ij + γ P_ij
  float delta_R = abs(risk_scores[i] - risk_scores[j]);
  float P_ij = 1.0f - exp(-LAMBDA * delta_R);

  return (ALPHA * R_bar) + (BETA * d_ij) + (GAMMA_PROP * P_ij);
}

void GraphEngine::updateAllWeights() {
  unsigned long start_time_us = micros();
  
  float risk_scores[NUM_ZONES];
  for (int i = 0; i < NUM_ZONES; i++) {
    risk_scores[i] = zones[i].risk_score;
  }

  for (int i = 0; i < NUM_ZONES; i++) {
    for (int j = 0; j < NUM_ZONES; j++) {
      if (adjacency[i][j]) {
        // If either zone is physically isolated by fire department/anomaly, block
        if (zones[i].isolated || zones[j].isolated) {
          weights[i][j] = 1.0f; // maximum cost weight
        } else {
          float cost = computeEdgeWeight(i, j, risk_scores);
          weights[i][j] = constrain(cost, 0.0f, 1.0f);
        }
      } else {
        weights[i][j] = 1.0f; // unconnected default
      }
    }
  }

  last_update_time_us = micros() - start_time_us;
}

float GraphEngine::getWeight(int i, int j) const {
  return weights[i][j];
}

bool GraphEngine::hasEdge(int i, int j) const {
  return adjacency[i][j];
}

void GraphEngine::isolateZone(int zone_id) {
  if (zone_id >= 0 && zone_id < NUM_ZONES) {
    zones[zone_id].isolated = true;
    updateAllWeights();
  }
}

void GraphEngine::restoreZone(int zone_id) {
  if (zone_id >= 0 && zone_id < NUM_ZONES) {
    zones[zone_id].isolated = false;
    updateAllWeights();
  }
}

int GraphEngine::computeCenter() {
  // Center is the node with minimum eccentricity (Subject: DMS)
  float shortest_paths[NUM_ZONES][NUM_ZONES];
  
  // Standard Floyd-Warshall to compute all pairs shortest paths over distances
  for (int i = 0; i < NUM_ZONES; i++) {
    for (int j = 0; j < NUM_ZONES; j++) {
      if (i == j) shortest_paths[i][j] = 0.0f;
      else if (adjacency[i][j]) shortest_paths[i][j] = distances[i][j];
      else shortest_paths[i][j] = 9999.0f;
    }
  }

  for (int k = 0; k < NUM_ZONES; k++) {
    for (int i = 0; i < NUM_ZONES; i++) {
      for (int j = 0; j < NUM_ZONES; j++) {
        if (shortest_paths[i][k] + shortest_paths[k][j] < shortest_paths[i][j]) {
          shortest_paths[i][j] = shortest_paths[i][k] + shortest_paths[k][j];
        }
      }
    }
  }

  float ecc[NUM_ZONES];
  int center_node = 0;
  float min_ecc = 9999.0f;

  for (int i = 0; i < NUM_ZONES; i++) {
    float max_d = 0.0f;
    for (int j = 0; j < NUM_ZONES; j++) {
      if (shortest_paths[i][j] < 999.0f && shortest_paths[i][j] > max_d) {
        max_d = shortest_paths[i][j];
      }
    }
    ecc[i] = max_d;
    if (ecc[i] < min_ecc) {
      min_ecc = ecc[i];
      center_node = i;
    }
  }

  return center_node; // Expected: Vertex 3 (Hallway)
}

int GraphEngine::computeChromatic() {
  // Greedy 5-node coloring algorithm mapping (Subject: DMS)
  int result[NUM_ZONES];
  result[0] = 0; // Assign color 0 to vertex 0
  
  for (int i = 1; i < NUM_ZONES; i++) {
    result[i] = -1; // unassigned
  }

  bool available[NUM_ZONES];
  for (int color = 0; color < NUM_ZONES; color++) available[color] = true;

  for (int u = 1; u < NUM_ZONES; u++) {
    // Process adjacent vertices
    for (int v = 0; v < NUM_ZONES; v++) {
      if (adjacency[u][v] && result[v] != -1) {
        available[result[v]] = false; // Mark neighbor color as occupied
      }
    }

    // Find the lowest index color that is unassigned
    int cr;
    for (cr = 0; cr < NUM_ZONES; cr++) {
      if (available[cr]) break;
    }

    result[u] = cr; // assign color

    // Restore table
    for (int color = 0; color < NUM_ZONES; color++) available[color] = true;
  }

  // Count unique colors
  int max_color = 0;
  for (int i = 0; i < NUM_ZONES; i++) {
    if (result[i] > max_color) max_color = result[i];
  }

  return max_color + 1; // Number of colors used (Expected: 3 due to triangle loops)
}

void GraphEngine::printWeightMatrix() {
  Serial.println("================ DYNAMIC WEIGHT MATRIX ==================");
  for (int i = 0; i < NUM_ZONES; i++) {
    Serial.printf("%8s |", zones[i].name);
    for (int j = 0; j < NUM_ZONES; j++) {
      if (adjacency[i][j]) {
        Serial.printf("  %s:%.2f ", zones[j].name, weights[i][j]);
      } else {
        Serial.print("   ---   ");
      }
    }
    Serial.println();
  }
  Serial.println("=========================================================");
}

void GraphEngine::printGraphProperties() {
  int center = computeCenter();
  int chromatic = computeChromatic();
  Serial.println("================ GRAPH TOPOLOGY AUDIT ===================");
  Serial.printf("Vertex Set count (V): %d | Edge Set count (E): %d\n", NUM_ZONES, NUM_EDGES);
  Serial.printf("Graph Topographic Center Node: %s\n", zones[center].name);
  Serial.printf("Topological Coloring Chromatic Number (X): %d\n", chromatic);
  Serial.println("=========================================================");
}

unsigned long GraphEngine::getLastUpdateTimeUs() const {
  return last_update_time_us;
}
