/**
 * Generic abstract queue class for processing messages
 * Queue-agnostic design allows different implementations (in-memory, Redis, RabbitMQ, etc.)
 * Can be used directly as a provider token in NestJS
 * Supports key-based parallel queues: items with the same key are processed sequentially,
 * while items with different keys can be processed in parallel
 */
export abstract class Queue<T> {
  /**
   * Enqueues an item to be processed
   * @param item The item to enqueue
   * @param key Optional key to group items into parallel queues. Items with the same key
   *            are processed sequentially, while items with different keys can be processed in parallel.
   *            If not provided, uses a default queue.
   */
  abstract enqueue(item: T, key?: string): Promise<void>;

  /**
   * Dequeues the next item from the queue
   * @param key Optional key to dequeue from a specific queue. If not provided, uses the default queue.
   * @returns The dequeued item or null if the queue is empty
   */
  abstract dequeue(key?: string): Promise<T | null>;

  /**
   * Gets the current size of the queue
   * @param key Optional key to get size of a specific queue. If not provided, returns total size.
   */
  abstract size(key?: string): Promise<number>;

  /**
   * Checks if the queue is empty
   * @param key Optional key to check a specific queue. If not provided, checks if all queues are empty.
   */
  abstract isEmpty(key?: string): Promise<boolean>;
}



