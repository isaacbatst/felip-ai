import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'node:crypto';
import {
  SubscriptionTokenRepository,
  SubscriptionTokenData,
  SubscriptionTokenValidationResult,
} from '../subscription-token.repository';
import { subscriptionTokens } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of SubscriptionTokenRepository
 */
@Injectable()
export class SubscriptionTokenDrizzleStore extends SubscriptionTokenRepository {
  private readonly logger = new Logger(SubscriptionTokenDrizzleStore.name);
  private readonly defaultTtlMinutes = 60; // 1 hour default

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return randomBytes(24).toString('hex'); // 48 characters
  }

  /**
   * Map database row to SubscriptionTokenData
   */
  private mapToTokenData(row: typeof subscriptionTokens.$inferSelect): SubscriptionTokenData {
    return {
      token: row.token,
      userId: row.userId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  async createToken(
    userId: string,
    ttlMinutes?: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken();
    const ttl = ttlMinutes ?? this.defaultTtlMinutes;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    // Delete any existing tokens for this user first (one active token per user)
    await this.deleteTokensByUserId(userId);

    // Insert new token
    await this.db.insert(subscriptionTokens).values({
      token,
      userId,
      expiresAt,
    });

    this.logger.log(`Created subscription token for userId: ${userId}, expires at: ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  async validateToken(token: string): Promise<SubscriptionTokenValidationResult> {
    const tokenData = await this.getToken(token);

    if (!tokenData) {
      return { valid: false, error: 'not_found' };
    }

    // Check if expired
    if (tokenData.expiresAt < new Date()) {
      return { valid: false, error: 'expired', token: tokenData };
    }

    return { valid: true, token: tokenData };
  }

  async getToken(token: string): Promise<SubscriptionTokenData | null> {
    const result = await this.db
      .select()
      .from(subscriptionTokens)
      .where(eq(subscriptionTokens.token, token))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToTokenData(result[0]);
  }

  async getUserIdFromToken(token: string): Promise<string | null> {
    const validation = await this.validateToken(token);
    if (!validation.valid || !validation.token) {
      return null;
    }
    return validation.token.userId;
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(subscriptionTokens)
      .where(lt(subscriptionTokens.expiresAt, new Date()))
      .returning({ token: subscriptionTokens.token });

    const count = result.length;
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired subscription tokens`);
    }

    return count;
  }

  async deleteTokensByUserId(userId: string): Promise<void> {
    await this.db
      .delete(subscriptionTokens)
      .where(eq(subscriptionTokens.userId, userId));
  }

  async refreshToken(token: string, ttlMinutes?: number): Promise<SubscriptionTokenData | null> {
    const ttl = ttlMinutes ?? this.defaultTtlMinutes;
    const newExpiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const result = await this.db
      .update(subscriptionTokens)
      .set({ expiresAt: newExpiresAt })
      .where(eq(subscriptionTokens.token, token))
      .returning();

    if (result.length === 0) {
      return null;
    }

    this.logger.log(`Refreshed subscription token, new expiration: ${newExpiresAt.toISOString()}`);

    return this.mapToTokenData(result[0]);
  }
}
