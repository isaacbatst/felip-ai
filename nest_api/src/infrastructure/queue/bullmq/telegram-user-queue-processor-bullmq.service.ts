import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { QueuedMessage } from '../../telegram/interfaces/queued-message';
import { TelegramUserMessageProcessor } from '../../telegram/telegram-user-message-processor';

/**
 * BullMQ-based queue processor for Telegram user messages
 * Single Responsibility: processing Telegram user messages via BullMQ
 */
@Processor('telegram-user-messages')
@Injectable()
export class TelegramUserQueueProcessorBullMQ extends WorkerHost {
  constructor(
    @InjectQueue('telegram-user-messages') private readonly queue: Queue,
    private readonly messageProcessor: TelegramUserMessageProcessor,
  ) {
    super();
  }

  async process(job: Job<QueuedMessage, any, string>): Promise<void> {
    switch (job.name) {
      case 'job': {
        const message = job.data;
        await this.messageProcessor.processMessage(message);
        break;
      }
      default:
        console.warn(`[WARN] Unknown job name: ${job.name}`);
    }
  }

  /**
   * Enqueues a message for processing
   */
  async enqueue(item: QueuedMessage): Promise<void> {
    await this.queue.add('job', item);
  }
}

