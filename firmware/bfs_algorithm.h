/**
 * =========================================================================
 * Smart Home Monitoring System — BFS Traversal Algorithm (bfs_algorithm.h)
 * =========================================================================
 */

#ifndef BFS_ALGORITHM_H
#define BFS_ALGORITHM_H

#include <Arduino.h>
#include "graph_engine.h"

enum VertexColor {
  COLOR_WHITE,
  COLOR_GRAY,
  COLOR_BLACK
};

struct BFSResult {
  int order[NUM_ZONES];
  int hop_distance[NUM_ZONES];
  int parent[NUM_ZONES];
  int n_visited;
  unsigned long execution_time_us;
};

class BFSAlgorithm {
private:
  int queue[NUM_ZONES];
  int q_head;
  int q_tail;
  int q_size;

  void enqueue(int v);
  int dequeue();
  bool isEmpty() const;

public:
  BFSAlgorithm();
  BFSResult run(const GraphEngine& graph, int source);
  void triggerGraduatedAlert(const BFSResult& result);
  void printBFSTree(const BFSResult& result, const GraphEngine& graph) const;
};

#endif // BFS_ALGORITHM_H
