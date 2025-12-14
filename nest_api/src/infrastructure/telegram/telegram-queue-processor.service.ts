import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { QueueProcessor } from './queue-processor.service';
import { QueuedMessage } from './telegram-user-message-handler';
import { TelegramUserMessageProcessor } from './telegram-user-message-processor';
import { TelegramUserMessageQueue } from './telegram-user-message-queue.token';

/**
 * Service that manages QueueProcessor for Telegram user messages
 * Single Responsibility: managing QueueProcessor lifecycle and providing enqueue interface
 * Ready to use via DI - no setup needed by consumers
 */
@Injectable()
export class TelegramQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private queueProcessor: QueueProcessor<QueuedMessage> | null = null;

  constructor(
    private readonly messageQueue: TelegramUserMessageQueue,
    private readonly messageProcessor: TelegramUserMessageProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    this.setupQueueProcessor();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queueProcessor) {
      await this.queueProcessor.stop();
    }
  }

  /**
   * Sets up the queue processor to process messages
   */
  private setupQueueProcessor(): void {
    const processor = async (item: QueuedMessage): Promise<void> => {
      await this.messageProcessor.processMessage(item);
    };
    this.queueProcessor = new QueueProcessor(this.messageQueue, processor);
    this.queueProcessor.start();
  }

  /**
   * Enqueues a message for processing
   * This triggers immediate processing if the processor is idle
   */
  async enqueue(item: QueuedMessage): Promise<void> {
    if (this.queueProcessor) {
      await this.queueProcessor.enqueue(item);
    }
  }
}

