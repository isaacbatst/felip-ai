import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'node:crypto';
import {
  DashboardTokenRepository,
  DashboardTokenData,
  DashboardTokenValidationResult,
} from '../dashboard-token.repository';
import { dashboardTokens } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of DashboardTokenRepository
 * Single Responsibility: dashboard token operations using Drizzle ORM with PostgreSQL
 */
@Injectable()
export class DashboardTokenDrizzleStore extends DashboardTokenRepository {
  private readonly logger = new Logger(DashboardTokenDrizzleStore.name);
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
   * Map database row to DashboardTokenData
   */
  private mapToTokenData(row: typeof dashboardTokens.$inferSelect): DashboardTokenData {
    return {
      token: row.token,
      userId: row.userId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  /**
   * Create a new dashboard token for a user
   */
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
    await this.db.insert(dashboardTokens).values({
      token,
      userId,
      expiresAt,
    });

    this.logger.log(`Created dashboard token for userId: ${userId}, expires at: ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  /**
   * Validate a token and return the user ID
   */
  async validateToken(token: string): Promise<DashboardTokenValidationResult> {
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

  /**
   * Get a token by its value
   */
  async getToken(token: string): Promise<DashboardTokenData | null> {
    const result = await this.db
      .select()
      .from(dashboardTokens)
      .where(eq(dashboardTokens.token, token))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToTokenData(result[0]);
  }

  /**
   * Get the user ID from a token
   */
  async getUserIdFromToken(token: string): Promise<string | null> {
    const validation = await this.validateToken(token);
    if (!validation.valid || !validation.token) {
      return null;
    }
    return validation.token.userId;
  }

  /**
   * Delete expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(dashboardTokens)
      .where(lt(dashboardTokens.expiresAt, new Date()))
      .returning({ token: dashboardTokens.token });

    const count = result.length;
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired dashboard tokens`);
    }

    return count;
  }

  /**
   * Delete all tokens for a specific user
   */
  async deleteTokensByUserId(userId: string): Promise<void> {
    await this.db
      .delete(dashboardTokens)
      .where(eq(dashboardTokens.userId, userId));
  }

  /**
   * Refresh a token (extend expiration)
   */
  async refreshToken(token: string, ttlMinutes?: number): Promise<DashboardTokenData | null> {
    const ttl = ttlMinutes ?? this.defaultTtlMinutes;
    const newExpiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const result = await this.db
      .update(dashboardTokens)
      .set({ expiresAt: newExpiresAt })
      .where(eq(dashboardTokens.token, token))
      .returning();

    if (result.length === 0) {
      return null;
    }

    this.logger.log(`Refreshed dashboard token, new expiration: ${newExpiresAt.toISOString()}`);

    return this.mapToTokenData(result[0]);
  }
}
