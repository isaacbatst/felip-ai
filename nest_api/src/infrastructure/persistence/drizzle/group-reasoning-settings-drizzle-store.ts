import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  GroupReasoningSettingsRepository,
  type GroupReasoningSetting,
  type GroupReasoningSettingInput,
} from '../group-reasoning-settings.repository';
import { groupReasoningSettings } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class GroupReasoningSettingsDrizzleStore extends GroupReasoningSettingsRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async getGroupReasoningSetting(userId: string, groupId: number): Promise<GroupReasoningSetting | null> {
    const result = await this.db
      .select()
      .from(groupReasoningSettings)
      .where(
        and(
          eq(groupReasoningSettings.userId, userId),
          eq(groupReasoningSettings.groupId, groupId),
        ),
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0] as GroupReasoningSetting;
  }

  async getAllGroupReasoningSettings(userId: string): Promise<GroupReasoningSetting[]> {
    return this.db
      .select()
      .from(groupReasoningSettings)
      .where(eq(groupReasoningSettings.userId, userId)) as Promise<GroupReasoningSetting[]>;
  }

  async upsertGroupReasoningSetting(
    userId: string,
    groupId: number,
    input: GroupReasoningSettingInput,
  ): Promise<GroupReasoningSetting> {
    const now = new Date();

    const result = await this.db
      .insert(groupReasoningSettings)
      .values({
        userId,
        groupId,
        reasoningMode: input.reasoningMode,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [groupReasoningSettings.userId, groupReasoningSettings.groupId],
        set: {
          reasoningMode: input.reasoningMode,
          updatedAt: now,
        },
      })
      .returning();

    return result[0] as GroupReasoningSetting;
  }
}
