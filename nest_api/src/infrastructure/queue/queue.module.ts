import { Module, forwardRef } from '@nestjs/common';
import { Context } from 'grammy';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { InfrastructureModule } from '../infrastructure.module';
import { QueuedMessage } from '../telegram/interfaces/queued-message';
import { QueueBullMQ } from './bullmq/queue-bullmq';
import { TelegramBotQueueProcessorBullMQ } from './bullmq/telegram-bot-queue-processor-bullmq.service';
import { TelegramUserQueueProcessorBullMQ } from './bullmq/telegram-user-queue-processor-bullmq.service';
import { TelegramBotMessageQueue } from './tokens/telegram-bot-message-queue.token';
import { TelegramUserMessageQueue } from './tokens/telegram-user-message-queue.token';

/**
 * Queue Module
 *
 * Provides queue implementations and exports abstract queue tokens.
 * This module hides implementation details, allowing easy swapping of queue
 * implementations (in-memory, Bull/Redis, RabbitMQ, etc.) without affecting
 * consumers.
 *
 * Currently uses BullMQ/Redis queues with @nestjs/bullmq integration.
 */
@Module({
  imports: [
    forwardRef(() => InfrastructureModule),
    BullModule.registerQueue({
      name: 'telegram-user-messages',
    }),
    BullModule.registerQueue({
      name: 'telegram-bot-messages',
    }),
    BullModule.registerQueue({
      name: 'tdlib-updates',
    }),
  ],
  providers: [
    {
      provide: TelegramUserMessageQueue,
      useFactory: (configService: ConfigService): TelegramUserMessageQueue => {
        const queueName = configService.get<string>('QUEUE_TELEGRAM_USER_MESSAGES') || 'telegram-user-messages';
        return new QueueBullMQ<QueuedMessage>(queueName, configService);
      },
      inject: [ConfigService],
    },
    {
      provide: TelegramBotMessageQueue,
      useFactory: (configService: ConfigService): TelegramBotMessageQueue => {
        const queueName = configService.get<string>('QUEUE_TELEGRAM_BOT_MESSAGES') || 'telegram-bot-messages';
        return new QueueBullMQ<Context['update']['message']>(queueName, configService);
      },
      inject: [ConfigService],
    },
    TelegramUserQueueProcessorBullMQ,
    TelegramBotQueueProcessorBullMQ,
  ],
  exports: [
    TelegramUserQueueProcessorBullMQ,
    TelegramBotQueueProcessorBullMQ,
  ],
})
export class QueueModule {}
