import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { Context } from 'grammy';
import { TelegramBotMessageHandler } from '../../telegram/handlers/telegram-bot-message.handler';

/**
 * BullMQ-based queue processor for Telegram bot messages
 * Single Responsibility: processing Telegram bot messages via BullMQ
 */
@Processor('telegram-bot-messages')
@Injectable()
export class TelegramBotQueueProcessorBullMQ extends WorkerHost {
  constructor(
    @InjectQueue('telegram-bot-messages') private readonly queue: Queue,
    private readonly messageHandler: TelegramBotMessageHandler,
  ) {
    super();
  }

  async process(job: Job<Context['update']['message']>): Promise<void> {
    switch (job.name) {
      case 'job': {
        const data = job.data;
        await this.messageHandler.handleMessage(data).catch((error: unknown) => {
          console.error('[ERROR] Error handling message:', error);
          throw error;
        });
        break;
      }
      default:
        console.warn(`[WARN] Unknown job name: ${job.name}`);
    }
  }

  /**
   * Enqueues a message for processing
   */
  async enqueue(item: Context['update']['message']): Promise<void> {
    await this.queue.add('job', item);
  }
}

