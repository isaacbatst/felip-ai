import { Queue } from './interfaces/queue.interface';

/**
 * Processor class that processes queue items with support for parallel queues by key
 * Single Responsibility: processing of queue items with key-based parallelization
 * Items with the same key are processed sequentially, while items with different keys
 * can be processed in parallel
 * Queue-agnostic: accepts a Queue instance via constructor, allowing different implementations
 */
export class QueueProcessor<T> {
  private shouldStop = false;
  private readonly queue: Queue<T>;
  private processor: (item: T) => Promise<void>;
  private keyExtractor?: (item: T) => string | undefined;
  private processingKeys: Set<string> = new Set();
  private readonly maxConcurrency?: number;

  /**
   * @param queue The queue instance to process items from
   * @param processor Function to process each queue item
   * @param keyExtractor Optional function to extract a key from an item for parallel processing.
   *                     Items with the same key are processed sequentially.
   *                     If not provided, all items are processed sequentially in a single queue.
   * @param maxConcurrency Optional maximum number of parallel queues that can be processed simultaneously.
   *                       If not provided, there is no limit (unlimited concurrency).
   */
  constructor(
    queue: Queue<T>,
    processor: (item: T) => Promise<void>,
    keyExtractor?: (item: T) => string | undefined,
    maxConcurrency?: number,
  ) {
    this.queue = queue;
    this.processor = processor;
    this.keyExtractor = keyExtractor;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Adds an item to the queue for processing
   * This is the only way items should be added to the queue
   * If the processor is idle for the item's key, it will start processing immediately
   * (subject to max concurrency limit)
   */
  async enqueue(item: T): Promise<void> {
    const key = this.keyExtractor ? this.keyExtractor(item) : undefined;
    await this.queue.enqueue(item, key);
    const queueKey = key ?? '__default__';
    
    // If already processing this key, no action needed
    if (this.processingKeys.has(queueKey) || this.shouldStop) {
      return;
    }

    // Check if we can start processing immediately
    if (this.canStartProcessing()) {
      console.log(`[DEBUG] QueueProcessor: Starting processing for key [${queueKey}]`);
      this.processNext(key).catch((error: unknown) => {
        console.error(`[ERROR] Error in queue processor for key [${queueKey}]:`, error);
      });
    } else {
      console.log(`[DEBUG] QueueProcessor: Queue [${queueKey}] will be processed when concurrency slot available`);
    }
  }

  start(): void {
    this.shouldStop = false;
    // Start processing for all queues that have items
    this.startProcessingForAllQueues();
  }

  async stop(): Promise<void> {
    this.shouldStop = true;
    // Wait for all processing to finish
    while (this.processingKeys.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Starts processing for all queues that have items (respecting max concurrency)
   */
  private startProcessingForAllQueues(): void {
    if (this.shouldStop || this.queue.isEmpty()) {
      return;
    }

    // Try to process from default queue if available and within concurrency limit
    const defaultKey = '__default__';
    if (
      !this.processingKeys.has(defaultKey) &&
      !this.queue.isEmpty(defaultKey) &&
      this.canStartProcessing()
    ) {
      this.processNext().catch((error: unknown) => {
        console.error('[ERROR] Error in queue processor:', error);
      });
    }

    // Try to start any pending queues
    this.tryStartPendingQueues();
  }

  /**
   * Checks if a new queue can start processing based on max concurrency limit
   */
  private canStartProcessing(): boolean {
    if (this.maxConcurrency === undefined) {
      return true; // No limit
    }
    return this.processingKeys.size < this.maxConcurrency;
  }

  /**
   * Computes and returns keys that have items but aren't being processed
   * Note: This only works if the queue implementation supports getKeysWithItems()
   * For queues that don't support this, key-based parallelization won't work
   */
  private getPendingKeys(): string[] {
    // Check if queue has getKeysWithItems method (not part of base interface)
    const queueWithKeys = this.queue as unknown as { getKeysWithItems?: () => string[] };
    if (queueWithKeys.getKeysWithItems) {
      const keysWithItems = queueWithKeys.getKeysWithItems();
      return keysWithItems.filter((key) => !this.processingKeys.has(key));
    }
    // If queue doesn't support getKeysWithItems, return empty array
    // Key-based parallelization won't work, but basic processing will still work
    return [];
  }

  /**
   * Tries to start processing for any pending queues that can now start
   */
  private tryStartPendingQueues(): void {
    if (this.shouldStop || !this.canStartProcessing()) {
      return;
    }

    const pendingKeys = this.getPendingKeys();
    if (pendingKeys.length === 0) {
      return;
    }

    // Try to start processing for pending queues
    for (const queueKey of pendingKeys) {
      if (!this.canStartProcessing()) {
        break; // Reached max concurrency
      }

      if (this.processingKeys.has(queueKey) || this.queue.isEmpty(queueKey)) {
        continue; // Skip if already processing or queue is empty
      }

      // Can start processing this queue
      console.log(`[DEBUG] QueueProcessor: Starting processing for pending key [${queueKey}]`);
      this.processNext(queueKey).catch((error: unknown) => {
        console.error(`[ERROR] Error in queue processor for key [${queueKey}]:`, error);
      });
    }
  }

  /**
   * Processes the next item in the queue for a specific key, then immediately processes
   * the next one if available. This creates a continuous processing chain until the queue
   * for that key is empty. Different keys process in parallel.
   */
  private async processNext(key?: string): Promise<void> {
    const queueKey = key ?? '__default__';

    if (this.shouldStop || this.processingKeys.has(queueKey) || this.queue.isEmpty(queueKey)) {
      return;
    }

    this.processingKeys.add(queueKey);
    try {
      const item = await this.queue.dequeue(queueKey);
      if (item !== null) {
        await this.processor(item);
      }
    } catch (error) {
      console.error(`[ERROR] Error processing queue item for key [${queueKey}]:`, error);
    } finally {
      this.processingKeys.delete(queueKey);
      
      // Immediately process next item for this key if available and not stopped
      if (!this.shouldStop && !this.queue.isEmpty(queueKey)) {
        this.processNext(key).catch((error: unknown) => {
          console.error(`[ERROR] Error in queue processor for key [${queueKey}]:`, error);
        });
      } else {
        // This queue is done, try to start any pending queues
        this.tryStartPendingQueues();
      }
    }
  }
}

