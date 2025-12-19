import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Context } from 'grammy';
import { InMemoryQueueProcessor } from '../../telegram/in-memory-queue-processor.service';
import { TelegramBotMessageQueue } from '../tokens/telegram-bot-message-queue.token';
import { TelegramBotMessageHandler } from '../../telegram/handlers/telegram-bot-message.handler';

/**
 * Service that manages QueueProcessor for Telegram bot messages
 * Single Responsibility: managing QueueProcessor lifecycle and providing enqueue interface
 * Ready to use via DI - no setup needed by consumers
 */
@Injectable()
export class TelegramBotInMemoryQueueProcessor implements OnModuleInit, OnModuleDestroy {
  private queueProcessor: InMemoryQueueProcessor<Context['update']['message']> | null = null;

  constructor(
    private readonly botMessageQueue: TelegramBotMessageQueue,
    private readonly messageHandler: TelegramBotMessageHandler,
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
    const processor = async (item: Context['update']['message']): Promise<void> => {
      this.messageHandler.handleMessage(item).catch((error: unknown) => {
        console.error('[ERROR] Error handling message:', error);
      });
    };
    this.queueProcessor = new InMemoryQueueProcessor(this.botMessageQueue, processor);
    this.queueProcessor.start();
  }

  /**
   * Enqueues a message context for processing
   * This triggers immediate processing if the processor is idle
   */
  async enqueue(item: Context['update']['message']): Promise<void> {
    if (this.queueProcessor) {
      await this.queueProcessor.enqueue(item);
    }
  }
}

