/**
 * =========================================================================
 * Smart Home Monitoring System — Priority Queue (priority_queue.h)
 * =========================================================================
 */

#ifndef PRIORITY_QUEUE_H
#define PRIORITY_QUEUE_H

#include <Arduino.h>
#include "config.h"

struct MQTTMessage {
  char payload[256];
  char topic[64];
  int priority; // 0-3 (higher is more urgent)
  int qos;      // 0-2
  unsigned long timestamp_ms;
  int sequence_number;
};

class PriorityQueue {
private:
  MQTTMessage heap[MAX_PQ_SIZE];
  int current_size;
  int sequence_counter;
  unsigned long last_enqueue_time_us;
  unsigned long last_dequeue_time_us;

  int parent(int i) const { return (i - 1) / 2; }
  int leftChild(int i) const { return 2 * i + 1; }
  int rightChild(int i) const { return 2 * i + 2; }
  
  void siftUp(int i);
  void siftDown(int i);
  int findMinPriorityIndex() const;

public:
  PriorityQueue();
  void initialize();
  
  bool insert(const char* payload, const char* topic, int priority, int qos);
  MQTTMessage extractMax();
  MQTTMessage peekMax() const;
  
  bool isEmpty() const;
  int getSize() const;
  int getQoSForPriority(int priority) const;
  
  void printQueue() const;
  unsigned long getLastEnqueueTimeUs() const;
  unsigned long getLastDequeueTimeUs() const;
};

#endif // PRIORITY_QUEUE_H
