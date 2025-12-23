import { Injectable, Inject } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { MessageProcessedLogRepository, MessageProcessedLogData } from '../message-processed-log.repository';
import { messagesProcessed } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of MessageProcessedLogRepository
 * Single Responsibility: logging processed messages using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class MessageProcessedLogDrizzleStore extends MessageProcessedLogRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Log a processed message
   */
  async logProcessedMessage(log: MessageProcessedLogData): Promise<void> {
    await this.db.insert(messagesProcessed).values({
      queueName: log.queueName,
      messageData: log.messageData as Record<string, unknown>,
      userId: log.userId ?? null,
      status: log.status,
      errorMessage: log.errorMessage ?? null,
      retryCount: log.retryCount ?? 0,
    });
  }
}

