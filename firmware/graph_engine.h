/**
 * =========================================================================
 * Smart Home Monitoring System — Graph Theory Engine (graph_engine.h)
 * =========================================================================
 */

#ifndef GRAPH_ENGINE_H
#define GRAPH_ENGINE_H

#include <Arduino.h>
#include "config.h"

struct Zone {
  int id;
  const char* name;
  float risk_score;
  float sensor_vector[5];
  bool isolated;
};

class GraphEngine {
private:
  Zone zones[NUM_ZONES];
  bool adjacency[NUM_ZONES][NUM_ZONES];
  float distances[NUM_ZONES][NUM_ZONES];
  float weights[NUM_ZONES][NUM_ZONES];
  unsigned long last_update_time_us;

public:
  GraphEngine();
  void initialize();
  void updateRiskScores(float R_current);
  float computeEdgeWeight(int i, int j, const float risk_scores[]);
  void updateAllWeights();
  
  float getWeight(int i, int j) const;
  bool hasEdge(int i, int j) const;
  void isolateZone(int zone_id);
  void restoreZone(int zone_id);
  
  int computeCenter();
  int computeChromatic();
  
  void printWeightMatrix();
  void printGraphProperties();
  unsigned long getLastUpdateTimeUs() const;
  Zone getZone(int id) const { return zones[id]; }
};

#endif // GRAPH_ENGINE_H
