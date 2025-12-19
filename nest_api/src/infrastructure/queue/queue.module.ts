import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

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
  exports: [
    BullModule
  ],
})
export class QueueModule {}
