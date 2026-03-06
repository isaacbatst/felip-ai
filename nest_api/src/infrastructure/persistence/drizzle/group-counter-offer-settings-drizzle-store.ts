import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  GroupCounterOfferSettingsRepository,
  type GroupCounterOfferSetting,
  type GroupCounterOfferSettingInput,
} from '../group-counter-offer-settings.repository';
import { groupCounterOfferSettings } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class GroupCounterOfferSettingsDrizzleStore extends GroupCounterOfferSettingsRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async getGroupSetting(userId: string, groupId: number): Promise<GroupCounterOfferSetting | null> {
    const result = await this.db
      .select()
      .from(groupCounterOfferSettings)
      .where(
        and(
          eq(groupCounterOfferSettings.userId, userId),
          eq(groupCounterOfferSettings.groupId, groupId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  async getAllGroupSettings(userId: string): Promise<GroupCounterOfferSetting[]> {
    return this.db
      .select()
      .from(groupCounterOfferSettings)
      .where(eq(groupCounterOfferSettings.userId, userId));
  }

  async upsertGroupSetting(
    userId: string,
    groupId: number,
    input: GroupCounterOfferSettingInput,
  ): Promise<GroupCounterOfferSetting> {
    const now = new Date();

    const result = await this.db
      .insert(groupCounterOfferSettings)
      .values({
        userId,
        groupId,
        isEnabled: input.isEnabled,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [groupCounterOfferSettings.userId, groupCounterOfferSettings.groupId],
        set: {
          isEnabled: input.isEnabled,
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  }

  async deleteGroupSetting(userId: string, groupId: number): Promise<void> {
    await this.db
      .delete(groupCounterOfferSettings)
      .where(
        and(
          eq(groupCounterOfferSettings.userId, userId),
          eq(groupCounterOfferSettings.groupId, groupId),
        ),
      );
  }
}
