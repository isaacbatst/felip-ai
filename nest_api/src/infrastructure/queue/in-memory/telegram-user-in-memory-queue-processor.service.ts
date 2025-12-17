import { TelegramUserMessageQueue } from '@/infrastructure/queue/tokens/telegram-user-message-queue.token';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InMemoryQueueProcessor } from '@/infrastructure/telegram/in-memory-queue-processor.service';
import { QueuedMessage } from '@/infrastructure/telegram/interfaces/queued-message';
import { TelegramUserMessageProcessor } from '@/infrastructure/telegram/telegram-user-message-processor';

/**
 * Service that manages QueueProcessor for Telegram user messages
 * Single Responsibility: managing QueueProcessor lifecycle and providing enqueue interface
 * Ready to use via DI - no setup needed by consumers
 */
@Injectable()
export class TelegramUserInMemoryQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private queueProcessor: InMemoryQueueProcessor<QueuedMessage> | null = null;

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
    this.queueProcessor = new InMemoryQueueProcessor(this.messageQueue, processor);
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

