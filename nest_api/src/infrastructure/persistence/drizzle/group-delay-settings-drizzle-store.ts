import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  GroupDelaySettingsRepository,
  type GroupDelaySetting,
  type GroupDelaySettingInput,
} from '../group-delay-settings.repository';
import { groupDelaySettings } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class GroupDelaySettingsDrizzleStore extends GroupDelaySettingsRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async getGroupDelaySetting(userId: string, groupId: number): Promise<GroupDelaySetting | null> {
    const result = await this.db
      .select()
      .from(groupDelaySettings)
      .where(
        and(
          eq(groupDelaySettings.userId, userId),
          eq(groupDelaySettings.groupId, groupId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  async getAllGroupDelaySettings(userId: string): Promise<GroupDelaySetting[]> {
    return this.db
      .select()
      .from(groupDelaySettings)
      .where(eq(groupDelaySettings.userId, userId));
  }

  async upsertGroupDelaySetting(
    userId: string,
    groupId: number,
    input: GroupDelaySettingInput,
  ): Promise<GroupDelaySetting> {
    const now = new Date();

    const result = await this.db
      .insert(groupDelaySettings)
      .values({
        userId,
        groupId,
        delayEnabled: input.delayEnabled,
        delayMin: input.delayMin,
        delayMax: input.delayMax,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [groupDelaySettings.userId, groupDelaySettings.groupId],
        set: {
          delayEnabled: input.delayEnabled,
          delayMin: input.delayMin,
          delayMax: input.delayMax,
          updatedAt: now,
        },
      })
      .returning();

    return result[0];
  }
}
