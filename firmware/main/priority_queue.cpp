/**
 * =========================================================================
 * Smart Home Monitoring System — Priority Queue (priority_queue.cpp)
 * =========================================================================
 */

#include "priority_queue.h"

PriorityQueue::PriorityQueue() {
  initialize();
}

void PriorityQueue::initialize() {
  current_size = 0;
  sequence_counter = 0;
  last_enqueue_time_us = 0;
  last_dequeue_time_us = 0;
}

// Custom priority tiebreaker logic: higher priority wins. If equal, oldest sequence number wins (FIFO behavior)
static bool isHigherPriority(const MQTTMessage& a, const MQTTMessage& b) {
  if (a.priority > b.priority) return true;
  if (a.priority == b.priority) {
    return a.sequence_number < b.sequence_number; // Older sequence number gets prioritized
  }
  return false;
}

void PriorityQueue::siftUp(int i) {
  while (i > 0 && isHigherPriority(heap[i], heap[parent(i)])) {
    MQTTMessage temp = heap[parent(i)];
    heap[parent(i)] = heap[i];
    heap[i] = temp;
    i = parent(i);
  }
}

void PriorityQueue::siftDown(int i) {
  int maxIndex = i;
  int l = leftChild(i);
  int r = rightChild(i);

  if (l < current_size && isHigherPriority(heap[l], heap[maxIndex])) {
    maxIndex = l;
  }
  if (r < current_size && isHigherPriority(heap[r], heap[maxIndex])) {
    maxIndex = r;
  }

  if (i != maxIndex) {
    MQTTMessage temp = heap[i];
    heap[i] = heap[maxIndex];
    heap[maxIndex] = temp;
    siftDown(maxIndex);
  }
}

int PriorityQueue::findMinPriorityIndex() const {
  if (current_size == 0) return -1;
  int min_idx = 0;
  for (int i = 1; i < current_size; i++) {
    // Inverse comparison to locate least urgent message
    if (!isHigherPriority(heap[i], heap[min_idx])) {
      min_idx = i;
    }
  }
  return min_idx;
}

bool PriorityQueue::insert(const char* payload, const char* topic, int priority, int qos) {
  unsigned long start_time_us = micros();
  
  MQTTMessage msg;
  strncpy(msg.payload, payload, sizeof(msg.payload) - 1);
  msg.payload[sizeof(msg.payload) - 1] = '\0';
  
  strncpy(msg.topic, topic, sizeof(msg.topic) - 1);
  msg.topic[sizeof(msg.topic) - 1] = '\0';
  
  msg.priority = priority;
  msg.qos = qos;
  msg.timestamp_ms = millis();
  msg.sequence_number = sequence_counter++;

  bool success = false;

  if (current_size < MAX_PQ_SIZE) {
    heap[current_size] = msg;
    current_size++;
    siftUp(current_size - 1);
    success = true;
  } else {
    // Saturated queue: find minimum priority payload to drop
    int min_idx = findMinPriorityIndex();
    if (min_idx != -1 && isHigherPriority(msg, heap[min_idx])) {
#if DEBUG_LOG
      Serial.printf("[PQ Alert] Queue overflow. Swapping out lower priority topic: %s \n", heap[min_idx].topic);
#endif
      heap[min_idx] = msg;
      siftUp(min_idx);
      siftDown(min_idx);
      success = true;
    } else {
#if DEBUG_LOG
      Serial.printf("[PQ Alert] Queue saturated. Dropped payload of priority %d on topic: %s\n", priority, topic);
#endif
      success = false;
    }
  }

  last_enqueue_time_us = micros() - start_time_us;
  return success;
}

MQTTMessage PriorityQueue::extractMax() {
  unsigned long start_time_us = micros();
  MQTTMessage empty_msg = {"", "", -1, 0, 0, -1};

  if (current_size == 0) {
    last_dequeue_time_us = micros() - start_time_us;
    return empty_msg;
  }

  MQTTMessage root = heap[0];
  heap[0] = heap[current_size - 1];
  current_size--;
  if (current_size > 0) {
    siftDown(0);
  }

  last_dequeue_time_us = micros() - start_time_us;
  return root;
}

MQTTMessage PriorityQueue::peekMax() const {
  MQTTMessage empty_msg = {"", "", -1, 0, 0, -1};
  if (current_size == 0) return empty_msg;
  return heap[0];
}

bool PriorityQueue::isEmpty() const {
  return current_size == 0;
}

int PriorityQueue::getSize() const {
  return current_size;
}

int PriorityQueue::getQoSForPriority(int priority) const {
  if (priority == 3) return 2; // Critical -> QoS 2
  if (priority == 2) return 1; // High Alert -> QoS 1
  return 0;                    // Standard monitor -> QoS 0
}

void PriorityQueue::printQueue() const {
  Serial.printf("================= PRIORITY QUEUE (%d/%d) ================\n", current_size, MAX_PQ_SIZE);
  for (int i = 0; i < current_size; i++) {
    Serial.printf("  Root element index %2d: Topic [%20s] | Priority %d | Seq: %d\n",
                  i, heap[i].topic, heap[i].priority, heap[i].sequence_number);
  }
  Serial.println("=========================================================");
}

unsigned long PriorityQueue::getLastEnqueueTimeUs() const {
  return last_enqueue_time_us;
}

unsigned long PriorityQueue::getLastDequeueTimeUs() const {
  return last_dequeue_time_us;
}
