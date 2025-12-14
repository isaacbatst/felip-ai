import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Context } from 'grammy';
import { QueueProcessor } from './queue-processor.service';
import { TelegramBotMessageQueue } from './telegram-bot-message-queue.token';
import { TelegramMessageHandler } from './handlers/telegram-message.handler';

/**
 * Service that manages QueueProcessor for Telegram bot messages
 * Single Responsibility: managing QueueProcessor lifecycle and providing enqueue interface
 * Ready to use via DI - no setup needed by consumers
 */
@Injectable()
export class TelegramBotQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private queueProcessor: QueueProcessor<Context> | null = null;

  constructor(
    private readonly botMessageQueue: TelegramBotMessageQueue,
    private readonly messageHandler: TelegramMessageHandler,
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
    const processor = async (item: Context): Promise<void> => {
      this.messageHandler.handleMessage(item).catch((error: unknown) => {
        console.error('[ERROR] Error handling message:', error);
      });
    };
    this.queueProcessor = new QueueProcessor(this.botMessageQueue, processor);
    this.queueProcessor.start();
  }

  /**
   * Enqueues a message context for processing
   * This triggers immediate processing if the processor is idle
   */
  async enqueue(item: Context): Promise<void> {
    if (this.queueProcessor) {
      await this.queueProcessor.enqueue(item);
    }
  }
}

