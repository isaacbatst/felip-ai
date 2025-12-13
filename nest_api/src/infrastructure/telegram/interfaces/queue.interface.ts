/**
 * Generic abstract queue class for processing messages
 * Queue-agnostic design allows different implementations (in-memory, Redis, RabbitMQ, etc.)
 * Can be used directly as a provider token in NestJS
 */
export abstract class Queue<T> {
  /**
   * Enqueues an item to be processed
   * @param item The item to enqueue
   */
  abstract enqueue(item: T): Promise<void>;

  /**
   * Dequeues the next item from the queue
   * Returns null if the queue is empty
   */
  abstract dequeue(): Promise<T | null>;

  /**
   * Gets the current size of the queue
   */
  abstract size(): number;

  /**
   * Checks if the queue is empty
   */
  abstract isEmpty(): boolean;
}

