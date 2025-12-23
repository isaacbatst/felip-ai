import { Module } from '@nestjs/common';
import { RabbitMQPublisherService } from './rabbitmq/rabbitmq-publisher.service';
import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';

/**
 * Queue Module
 *
 * Provides queue implementations and exports abstract queue tokens.
 * This module hides implementation details, allowing easy swapping of queue
 * implementations (in-memory, RabbitMQ, etc.) without affecting
 * consumers.
 *
 * Currently uses RabbitMQ queues with amqplib integration.
 */
@Module({
  imports: [PersistenceModule],
  providers: [
    RabbitMQPublisherService,
  ],
  exports: [
    RabbitMQPublisherService,
  ],
})
export class QueueModule {}
