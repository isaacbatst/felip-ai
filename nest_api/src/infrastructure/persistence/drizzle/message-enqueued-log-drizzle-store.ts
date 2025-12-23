import { Injectable, Inject } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { MessageEnqueuedLogRepository, MessageEnqueuedLogData } from '../message-enqueued-log.repository';
import { messagesEnqueued } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of MessageEnqueuedLogRepository
 * Single Responsibility: logging enqueued messages using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class MessageEnqueuedLogDrizzleStore extends MessageEnqueuedLogRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Log an enqueued message
   */
  async logEnqueuedMessage(log: MessageEnqueuedLogData): Promise<void> {
    await this.db.insert(messagesEnqueued).values({
      queueName: log.queueName,
      messageData: log.messageData as Record<string, unknown>,
      userId: log.userId ?? null,
    });
  }
}

