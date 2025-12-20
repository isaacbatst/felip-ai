import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ActiveGroupsRepository } from '../active-groups.repository';
import { activeGroups } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of ActiveGroupsRepository
 * Single Responsibility: active groups operations using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class ActiveGroupsDrizzleStore extends ActiveGroupsRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Get active groups for a user
   */
  async getActiveGroups(userId: string): Promise<number[] | null> {
    const result = await this.db
      .select({
        groupId: activeGroups.groupId,
      })
      .from(activeGroups)
      .where(eq(activeGroups.userId, userId));

    if (result.length === 0) {
      return null;
    }

    return result.map((row) => row.groupId);
  }

  /**
   * Set active groups for a user
   */
  async setActiveGroups(userId: string, groups: number[]): Promise<void> {
    // Delete existing groups for this user
    await this.db.delete(activeGroups).where(eq(activeGroups.userId, userId));

    // Insert new groups
    if (groups.length > 0) {
      await this.db.insert(activeGroups).values(
        groups.map((groupId) => ({
          userId,
          groupId,
        })),
      );
    }
  }

  /**
   * Remove an active group for a user
   */
  async removeActiveGroup(userId: string, groupId: number): Promise<void> {
    await this.db
      .delete(activeGroups)
      .where(
        and(
          eq(activeGroups.userId, userId),
          eq(activeGroups.groupId, groupId),
        ),
      );
  }

  /**
   * Add an active group for a user
   */
  async addActiveGroup(userId: string, groupId: number): Promise<void> {
    // Insert group, ignore if already exists (handled by unique constraint)
    await this.db
      .insert(activeGroups)
      .values({
        userId,
        groupId,
      })
      .onConflictDoNothing({
        target: [activeGroups.userId, activeGroups.groupId],
      });
  }
}

