/**
 * =========================================================================
 * Smart Home Monitoring System — DFS Traversal Algorithm (dfs_algorithm.h)
 * =========================================================================
 */

#ifndef DFS_ALGORITHM_H
#define DFS_ALGORITHM_H

#include <Arduino.h>
#include "graph_engine.h"
#include "bfs_algorithm.h"

struct DFSResult {
  int discovery_time[NUM_ZONES];
  int finish_time[NUM_ZONES];
  int parent[NUM_ZONES];
  int back_edges[10][2];
  int n_back_edges;
  int evacuation_order[NUM_ZONES]; // Sorted list by ascending finish times
  unsigned long execution_time_us;
};

class DFSAlgorithm {
private:
  int time_counter;
  VertexColor color[NUM_ZONES];
  
  void dfsVisit(const GraphEngine& graph, int u, DFSResult& result);

public:
  DFSAlgorithm();
  DFSResult run(const GraphEngine& graph, int source);
  void computeEvacuationOrder(DFSResult& result);
  void identifyCycleTraps(const DFSResult& result, const GraphEngine& graph) const;
  void printDFSResults(const DFSResult& result, const GraphEngine& graph) const;
  void printComparison(const BFSResult& bfs, const DFSResult& dfs, const GraphEngine& graph) const;
};

#endif // DFS_ALGORITHM_H
