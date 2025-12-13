import { Injectable, Logger } from '@nestjs/common';
import { Queue } from './interfaces/queue.interface';

const DEFAULT_KEY = '__default__';

/**
 * In-memory implementation of MessageQueue
 * Single Responsibility: queue management using in-memory storage
 * Supports key-based parallel queues: items with the same key are processed sequentially,
 * while items with different keys can be processed in parallel
 */
@Injectable()
export class QueueInMemory<T> extends Queue<T> {
  private readonly logger = new Logger(QueueInMemory.name);
  private readonly queues: Map<string, T[]> = new Map();
  private readonly maxItems?: number;

  constructor(maxItems?: number) {
    super();
    this.maxItems = maxItems;
    // Initialize default queue
    this.queues.set(DEFAULT_KEY, []);
  }

  private getQueue(key: string = DEFAULT_KEY): T[] {
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }
    return queue;
  }

  async enqueue(item: T, key?: string): Promise<void> {
    const queueKey = key ?? DEFAULT_KEY;
    const queue = this.getQueue(queueKey);

    // If maxItems is set and queue is at capacity, remove oldest items
    if (this.maxItems !== undefined && queue.length >= this.maxItems) {
      const itemsToRemove = queue.length - this.maxItems + 1;
      const removedItems: T[] = [];
      for (let i = 0; i < itemsToRemove; i++) {
        const removedItem = queue.shift();
        if (removedItem !== undefined) {
          removedItems.push(removedItem);
        }
      }
      this.logger.warn(
        `Queue [${queueKey}] reached max capacity (${this.maxItems}). Removed ${removedItems.length} oldest item(s):`,
        removedItems,
      );
    }
    console.log(`Enqueuing item to queue [${queueKey}]`, item);
    queue.push(item);
  }

  async dequeue(key?: string): Promise<T | null> {
    const queueKey = key ?? DEFAULT_KEY;
    const queue = this.getQueue(queueKey);
    return queue.shift() ?? null;
  }

  size(key?: string): number {
    if (key !== undefined) {
      const queue = this.getQueue(key);
      return queue.length;
    }
    // Return total size across all queues
    let totalSize = 0;
    for (const queue of this.queues.values()) {
      totalSize += queue.length;
    }
    return totalSize;
  }

  isEmpty(key?: string): boolean {
    if (key !== undefined) {
      const queue = this.getQueue(key);
      return queue.length === 0;
    }
    // Check if all queues are empty
    for (const queue of this.queues.values()) {
      if (queue.length > 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Gets all keys that have items in their queues
   */
  getKeysWithItems(): string[] {
    const keys: string[] = [];
    for (const [key, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        keys.push(key);
      }
    }
    return keys;
  }
}

