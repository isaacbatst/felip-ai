import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PromptConfigRepository, type PromptConfigData } from '../prompt-config.repository';
import { promptConfigs } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of PromptConfigRepository
 * Single Responsibility: prompt config operations using Drizzle ORM with PostgreSQL
 */
@Injectable()
export class PromptConfigDrizzleStore extends PromptConfigRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Get prompt config by key
   * Returns null if no config exists for the given key
   */
  async getByKey(key: string): Promise<PromptConfigData | null> {
    const result = await this.db
      .select({
        id: promptConfigs.id,
        key: promptConfigs.key,
        promptId: promptConfigs.promptId,
        version: promptConfigs.version,
      })
      .from(promptConfigs)
      .where(eq(promptConfigs.key, key))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0];
  }

  /**
   * Upsert prompt config
   * Creates or updates the config for the given key
   */
  async upsert(key: string, promptId: string, version: string): Promise<PromptConfigData> {
    const result = await this.db
      .insert(promptConfigs)
      .values({
        key,
        promptId,
        version,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: promptConfigs.key,
        set: {
          promptId,
          version,
          updatedAt: new Date(),
        },
      })
      .returning({
        id: promptConfigs.id,
        key: promptConfigs.key,
        promptId: promptConfigs.promptId,
        version: promptConfigs.version,
      });

    return result[0];
  }
}
