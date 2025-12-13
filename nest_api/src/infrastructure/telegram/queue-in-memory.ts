import { Injectable, Logger } from '@nestjs/common';
import { Queue } from './interfaces/queue.interface';

/**
 * In-memory implementation of MessageQueue
 * Single Responsibility: queue management using in-memory storage
 */
@Injectable()
export class QueueInMemory<T> extends Queue<T> {
  private readonly logger = new Logger(QueueInMemory.name);
  private readonly queue: T[] = [];
  private readonly maxItems?: number;

  constructor(maxItems?: number) {
    super();
    this.maxItems = maxItems;
  }

  async enqueue(item: T): Promise<void> {
    // If maxItems is set and queue is at capacity, remove oldest items
    if (this.maxItems !== undefined && this.queue.length >= this.maxItems) {
      const itemsToRemove = this.queue.length - this.maxItems + 1;
      const removedItems: T[] = [];
      for (let i = 0; i < itemsToRemove; i++) {
        const removedItem = this.queue.shift();
        if (removedItem !== undefined) {
          removedItems.push(removedItem);
        }
      }
      this.logger.warn(
        `Queue reached max capacity (${this.maxItems}). Removed ${removedItems.length} oldest item(s):`,
        removedItems,
      );
    }
    this.queue.push(item);
  }

  async dequeue(): Promise<T | null> {
    return this.queue.shift() ?? null;
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }
}

