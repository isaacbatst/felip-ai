import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  CounterOfferSettingsRepository,
  type CounterOfferSettings,
  type CounterOfferSettingsInput,
} from '../counter-offer-settings.repository';
import { userCounterOfferSettings } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of CounterOfferSettingsRepository
 * Single Responsibility: counter offer settings operations using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class CounterOfferSettingsDrizzleStore extends CounterOfferSettingsRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Get counter offer settings for a user
   * Returns null if no settings exist (feature not configured)
   */
  async getSettings(userId: string): Promise<CounterOfferSettings | null> {
    const result = await this.db
      .select()
      .from(userCounterOfferSettings)
      .where(eq(userCounterOfferSettings.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Upsert counter offer settings for a user
   * Creates or updates the record
   */
  async upsertSettings(userId: string, settings: CounterOfferSettingsInput): Promise<CounterOfferSettings> {
    const now = new Date();

    const result = await this.db
      .insert(userCounterOfferSettings)
      .values({
        userId,
        isEnabled: settings.isEnabled,
        priceThreshold: settings.priceThreshold,
        messageTemplateId: settings.messageTemplateId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userCounterOfferSettings.userId,
        set: {
          isEnabled: settings.isEnabled,
          priceThreshold: settings.priceThreshold,
          messageTemplateId: settings.messageTemplateId,
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  }
}
