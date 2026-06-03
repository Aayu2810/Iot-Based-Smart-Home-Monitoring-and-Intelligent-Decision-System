/**
 * =========================================================================
 * Smart Home Monitoring System — Dijkstra Pathfinder (dijkstra_algorithm.h)
 * =========================================================================
 */

#ifndef DIJKSTRA_ALGORITHM_H
#define DIJKSTRA_ALGORITHM_H

#include <Arduino.h>
#include "graph_engine.h"
#include "bfs_algorithm.h"

struct DijkstraResult {
  float dist[NUM_ZONES];
  int prev[NUM_ZONES];
  int path[NUM_ZONES];
  int path_length;
  float total_cost;
  unsigned long execution_time_us;
  bool path_differs_from_bfs;
};

struct MinHeapNode {
  float cost;
  int vertex;
};

class MinHeap {
private:
  MinHeapNode heap[NUM_ZONES * 2];
  int heap_size;

  void siftUp(int i);
  void siftDown(int i);

public:
  MinHeap();
  void initialize();
  void insert(float cost, int v);
  MinHeapNode extractMin();
  bool isEmpty() const;
};

class DijkstraAlgorithm {
private:
  MinHeap min_heap;

public:
  DijkstraAlgorithm();
  float computeSafetyCost(const GraphEngine& graph, int i, int j);
  DijkstraResult run(const GraphEngine& graph, int source, int exit_zone);
  void compareWithBFS(DijkstraResult& dijkstra, const BFSResult& bfs, int source, int exit_zone);
  void printDijkstraResult(const DijkstraResult& result, const GraphEngine& graph) const;
};

#endif // DIJKSTRA_ALGORITHM_H
