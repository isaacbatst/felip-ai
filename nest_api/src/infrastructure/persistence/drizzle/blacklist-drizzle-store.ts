import { Injectable, Inject } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  BlacklistRepository,
  type BlacklistedUser,
  type BlacklistScope,
  type AddToBlacklistInput,
} from '../blacklist.repository';
import { blacklistedUsers } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

type BlacklistedUserRow = typeof blacklistedUsers.$inferSelect;

@Injectable()
export class BlacklistDrizzleStore extends BlacklistRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private mapRow(row: BlacklistedUserRow): BlacklistedUser {
    return { ...row, scope: row.scope as BlacklistScope };
  }

  async getBlacklist(userId: string): Promise<BlacklistedUser[]> {
    const rows = await this.db
      .select()
      .from(blacklistedUsers)
      .where(eq(blacklistedUsers.userId, userId));
    return rows.map((r) => this.mapRow(r));
  }

  async isBlocked(
    userId: string,
    blockedTelegramUserId: number,
    scope: 'group' | 'private',
  ): Promise<boolean> {
    const result = await this.db
      .select({ id: blacklistedUsers.id })
      .from(blacklistedUsers)
      .where(
        and(
          eq(blacklistedUsers.userId, userId),
          eq(blacklistedUsers.blockedTelegramUserId, blockedTelegramUserId),
          or(
            eq(blacklistedUsers.scope, scope),
            eq(blacklistedUsers.scope, 'both'),
          ),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  async add(userId: string, input: AddToBlacklistInput): Promise<BlacklistedUser> {
    const [result] = await this.db
      .insert(blacklistedUsers)
      .values({
        userId,
        blockedTelegramUserId: input.blockedTelegramUserId,
        blockedUsername: input.blockedUsername,
        blockedName: input.blockedName,
        scope: input.scope,
      })
      .onConflictDoUpdate({
        target: [blacklistedUsers.userId, blacklistedUsers.blockedTelegramUserId],
        set: {
          scope: input.scope,
          blockedUsername: input.blockedUsername,
          blockedName: input.blockedName,
        },
      })
      .returning();

    return this.mapRow(result);
  }

  async remove(userId: string, id: number): Promise<void> {
    await this.db
      .delete(blacklistedUsers)
      .where(
        and(
          eq(blacklistedUsers.id, id),
          eq(blacklistedUsers.userId, userId),
        ),
      );
  }
}
