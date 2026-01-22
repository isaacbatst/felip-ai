import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BotStatusRepository } from '../bot-status.repository';
import { botStatus } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of BotStatusRepository
 * Single Responsibility: bot status operations using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class BotStatusDrizzleStore extends BotStatusRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Get bot status for a user
   * Returns true if enabled, false if disabled
   * Default is true if no record exists
   */
  async getBotStatus(userId: string): Promise<boolean> {
    const result = await this.db
      .select({
        isEnabled: botStatus.isEnabled,
      })
      .from(botStatus)
      .where(eq(botStatus.userId, userId))
      .limit(1);

    if (result.length === 0) {
      // Default is on (true) if no record exists
      return true;
    }

    return result[0].isEnabled;
  }

  /**
   * Set bot status for a user
   * Creates or updates the record
   */
  async setBotStatus(userId: string, isEnabled: boolean): Promise<void> {
    await this.db
      .insert(botStatus)
      .values({
        userId,
        isEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botStatus.userId,
        set: {
          isEnabled,
          updatedAt: new Date(),
        },
      });
  }
}
