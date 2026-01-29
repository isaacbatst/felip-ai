import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomBytes } from 'node:crypto';
import {
  AuthTokenRepository,
  AuthTokenData,
  TokenValidationResult,
} from '../auth-token.repository';
import { ConversationRepository } from '../conversation.repository';
import { authTokens } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of AuthTokenRepository
 * Single Responsibility: auth token operations using Drizzle ORM with PostgreSQL
 */
@Injectable()
export class AuthTokenDrizzleStore extends AuthTokenRepository {
  private readonly logger = new Logger(AuthTokenDrizzleStore.name);
  private readonly defaultTtlMinutes = 10;
  private readonly maxAttempts = 3;

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly conversationRepository: ConversationRepository,
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
   * Create a new auth token for a session
   */
  async createToken(
    requestId: string,
    ttlMinutes?: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken();
    const ttl = ttlMinutes ?? this.defaultTtlMinutes;
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    // Delete any existing tokens for this requestId first
    await this.deleteTokensByRequestId(requestId);

    // Insert new token
    await this.db.insert(authTokens).values({
      token,
      requestId,
      expiresAt,
    });

    this.logger.log(`Created auth token for requestId: ${requestId}, expires at: ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  /**
   * Validate a token and return the associated session
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    const tokenData = await this.getToken(token);

    if (!tokenData) {
      return { valid: false, error: 'not_found' };
    }

    // Check if expired
    if (tokenData.expiresAt < new Date()) {
      return { valid: false, error: 'expired', token: tokenData };
    }

    // Check if already used
    if (tokenData.usedAt !== null) {
      return { valid: false, error: 'already_used', token: tokenData };
    }

    // Check max attempts
    if (tokenData.attempts >= this.maxAttempts) {
      return { valid: false, error: 'max_attempts', token: tokenData };
    }

    // Get associated session
    const session = await this.conversationRepository.getConversation(tokenData.requestId);
    if (!session) {
      return { valid: false, error: 'not_found', token: tokenData };
    }

    return { valid: true, token: tokenData, session };
  }

  /**
   * Mark a token as used
   */
  async markTokenAsUsed(token: string): Promise<void> {
    await this.db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(eq(authTokens.token, token));

    this.logger.log(`Marked token as used: ${token.substring(0, 8)}...`);
  }

  /**
   * Increment the attempt counter
   */
  async incrementAttempts(token: string): Promise<number> {
    const tokenData = await this.getToken(token);
    if (!tokenData) {
      throw new Error('Token not found');
    }

    const newAttempts = tokenData.attempts + 1;

    await this.db
      .update(authTokens)
      .set({ attempts: newAttempts })
      .where(eq(authTokens.token, token));

    this.logger.log(`Incremented attempts for token ${token.substring(0, 8)}... to ${newAttempts}`);

    return newAttempts;
  }

  /**
   * Get a token by its value
   */
  async getToken(token: string): Promise<AuthTokenData | null> {
    const result = await this.db
      .select()
      .from(authTokens)
      .where(eq(authTokens.token, token))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      token: row.token,
      requestId: row.requestId,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
      attempts: row.attempts,
      createdAt: row.createdAt,
    };
  }

  /**
   * Delete expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(authTokens)
      .where(lt(authTokens.expiresAt, new Date()))
      .returning({ token: authTokens.token });

    const count = result.length;
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired auth tokens`);
    }

    return count;
  }

  /**
   * Delete all tokens for a specific session
   */
  async deleteTokensByRequestId(requestId: string): Promise<void> {
    await this.db
      .delete(authTokens)
      .where(eq(authTokens.requestId, requestId));
  }
}
