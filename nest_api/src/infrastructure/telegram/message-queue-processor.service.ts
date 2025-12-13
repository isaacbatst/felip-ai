import { Queue } from './interfaces/queue.interface';

/**
 * Processor class that processes queue items synchronously (one at a time)
 * Single Responsibility: synchronous processing of queue items
 */
export class MessageQueueProcessor<T> {
  private isProcessing = false;
  private shouldStop = false;

  constructor(
    private readonly queue: Queue<T>,
    private readonly processor: (item: T) => Promise<void>,
  ) {}

  /**
   * Adds an item to the queue for processing
   * This is the only way items should be added to the queue
   * If the processor is idle, it will start processing immediately
   */
  async enqueue(item: T): Promise<void> {
    await this.queue.enqueue(item);
    // If idle, trigger processing
    if (!this.isProcessing && !this.shouldStop) {
      this.processNext().catch((error: unknown) => {
        console.error('[ERROR] Error in queue processor:', error);
      });
    }
  }

  start(): void {
    this.shouldStop = false;
    // Start processing if there are items in the queue
    if (!this.isProcessing && !this.queue.isEmpty()) {
      this.processNext().catch((error: unknown) => {
        console.error('[ERROR] Error in queue processor:', error);
      });
    }
  }

  async stop(): Promise<void> {
    this.shouldStop = true;
    // Wait for current processing to finish
    while (this.isProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Processes the next item in the queue, then immediately processes the next one if available
   * This creates a continuous processing chain until the queue is empty
   */
  private async processNext(): Promise<void> {
    if (this.shouldStop || this.isProcessing || this.queue.isEmpty()) {
      return;
    }

    this.isProcessing = true;
    try {
      const item = await this.queue.dequeue();
      if (item !== null) {
        await this.processor(item);
      }
    } catch (error) {
      console.error('[ERROR] Error processing queue item:', error);
    } finally {
      this.isProcessing = false;
      // Immediately process next item if available and not stopped
      if (!this.shouldStop && !this.queue.isEmpty()) {
        this.processNext().catch((error: unknown) => {
          console.error('[ERROR] Error in queue processor:', error);
        });
      }
    }
  }
}

