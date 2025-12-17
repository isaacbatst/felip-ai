import { Injectable } from '@nestjs/common';
import { ActiveGroupsRepository } from '../active-groups.repository';
import { RedisRepository } from './redis.repository';

/**
 * Redis implementation of ActiveGroupsRepository
 * Single Responsibility: active groups operations using Redis
 */
@Injectable()
export class ActiveGroupsRedisStore extends ActiveGroupsRepository {
  private readonly keyPrefix = 'active-groups:';

  constructor(private readonly redis: RedisRepository) {
    super();
  }

  /**
   * Get active groups for a user
   */
  async getActiveGroups(userId: string): Promise<number[] | null> {
    const key = `${this.keyPrefix}${userId}`;
    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as number[];
    } catch (error) {
      return null;
    }
  }

  /**
   * Set active groups for a user
   */
  async setActiveGroups(userId: string, groups: number[]): Promise<void> {
    const key = `${this.keyPrefix}${userId}`;
    const data = JSON.stringify(groups);
    await this.redis.set(key, data);
  }

  /**
   * Remove an active group for a user
   */
  async removeActiveGroup(userId: string, groupId: number): Promise<void> {
    const groups = await this.getActiveGroups(userId);
    if (!groups) {
      return;
    }
    const updatedGroups = groups.filter((id) => id !== groupId);
    await this.setActiveGroups(userId, updatedGroups);
  }

  /**
   * Add an active group for a user
   */
  async addActiveGroup(userId: string, groupId: number): Promise<void> {
    const groups = await this.getActiveGroups(userId);
    if (!groups) {
      await this.setActiveGroups(userId, [groupId]);
      return;
    }
    if (!groups.includes(groupId)) {
      await this.setActiveGroups(userId, [...groups, groupId]);
    }
  }
}
