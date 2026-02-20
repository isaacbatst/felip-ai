import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { BotPreferenceRepository, type DelayDefaults } from '../bot-status.repository';
import { botPreferences } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of BotPreferenceRepository
 * Only handles bot preference (isEnabled) — operational state is managed in-memory.
 */
@Injectable()
export class BotPreferenceDrizzleStore extends BotPreferenceRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async getBotStatus(userId: string): Promise<boolean> {
    const result = await this.db
      .select({
        isEnabled: botPreferences.isEnabled,
      })
      .from(botPreferences)
      .where(eq(botPreferences.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    return result[0].isEnabled;
  }

  async setBotStatus(userId: string, isEnabled: boolean): Promise<void> {
    await this.db
      .insert(botPreferences)
      .values({
        userId,
        isEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botPreferences.userId,
        set: {
          isEnabled,
          updatedAt: new Date(),
        },
      });
  }

  async getDelayDefaults(userId: string): Promise<DelayDefaults> {
    const result = await this.db
      .select({
        delayMin: botPreferences.delayMin,
        delayMax: botPreferences.delayMax,
      })
      .from(botPreferences)
      .where(eq(botPreferences.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return { delayMin: 0, delayMax: 0 };
    }

    return result[0];
  }

  async setDelayDefaults(userId: string, delayMin: number, delayMax: number): Promise<void> {
    await this.db
      .insert(botPreferences)
      .values({
        userId,
        isEnabled: false, // Safe default — do not implicitly enable the bot on first write
        delayMin,
        delayMax,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: botPreferences.userId,
        set: {
          delayMin,
          delayMax,
          updatedAt: new Date(),
        },
      });
  }
}
