import { Injectable, Logger } from '@nestjs/common';
import { ConversationRepository, SessionData, SessionState } from '../conversation.repository';
import { RedisRepository } from './redis.repository';

/**
 * Redis implementation of ConversationRepository
 * Single Responsibility: unified session data operations using Redis
 */
@Injectable()
export class ConversationRedisStore extends ConversationRepository {
  private readonly logger = new Logger(ConversationRedisStore.name);
  private readonly sessionKeyPrefix = 'session:';
  private readonly telegramUserIdIndexPrefix = 'session:telegramUserId:';
  private readonly loggedInUserIdIndexPrefix = 'session:loggedInUserId:';
  private readonly sessionTtlSeconds = 30 * 60; // 30 minutes TTL for active sessions
  private readonly completedSessionTtlSeconds = 365 * 24 * 60 * 60; // 1 year TTL for completed sessions (persistent login)

  constructor(private readonly redis: RedisRepository) {
    super();
  }

  /**
   * Store a session
   * This will cancel any existing active sessions for the same loggedInUserId to ensure only one active session exists
   */
  async setSession(session: SessionData): Promise<void> {
    try {
      // Cancel any existing active sessions for this loggedInUserId
      const existingActiveSession = await this.getActiveSessionByLoggedInUserId(session.loggedInUserId);
      if (existingActiveSession && existingActiveSession.requestId !== session.requestId) {
        // Mark existing session as failed since a new one is being created
        existingActiveSession.state = 'failed';
        await this.redis.set(
          `${this.sessionKeyPrefix}${existingActiveSession.requestId}`,
          JSON.stringify(existingActiveSession),
          this.sessionTtlSeconds,
        );
        // Clear indexes
        await this.redis.del(`${this.telegramUserIdIndexPrefix}${existingActiveSession.telegramUserId}`);
        await this.redis.del(`${this.loggedInUserIdIndexPrefix}${existingActiveSession.loggedInUserId}`);
      }

      const sessionKey = `${this.sessionKeyPrefix}${session.requestId}`;
      const ttl = session.state === 'completed' ? this.completedSessionTtlSeconds : this.sessionTtlSeconds;

      // Store session data by requestId
      await this.redis.set(
        sessionKey,
        JSON.stringify(session),
        ttl,
      );

      // Store index: telegramUserId -> requestId (for quick lookup)
      await this.redis.set(
        `${this.telegramUserIdIndexPrefix}${session.telegramUserId}`,
        session.requestId,
        ttl,
      );

      // Store index: loggedInUserId -> requestId (for quick lookup)
      await this.redis.set(
        `${this.loggedInUserIdIndexPrefix}${session.loggedInUserId}`,
        session.requestId,
        ttl,
      );
    } catch (error) {
      this.logger.error('Redis error in setSession', {
        error: error instanceof Error ? error.message : String(error),
        requestId: session.requestId,
        loggedInUserId: session.loggedInUserId,
        telegramUserId: session.telegramUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get a session by requestId
   */
  async getSession(requestId: string): Promise<SessionData | null> {
    try {
      const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
      const data = await this.redis.get(sessionKey);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as SessionData;
    } catch (error) {
      this.logger.error('Redis error in getSession', {
        error: error instanceof Error ? error.message : String(error),
        requestId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get a session by telegramUserId (the user interacting with the bot)
   * Returns the most recent active session
   */
  async getSessionByTelegramUserId(telegramUserId: number): Promise<SessionData | null> {
    try {
      const indexKey = `${this.telegramUserIdIndexPrefix}${telegramUserId}`;
      const requestId = await this.redis.get(indexKey);
      if (!requestId) {
        return null;
      }
      return this.getSession(requestId);
    } catch (error) {
      this.logger.error('Redis error in getSessionByTelegramUserId', {
        error: error instanceof Error ? error.message : String(error),
        telegramUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get active session by loggedInUserId (returns the most recent non-completed session)
   */
  async getActiveSessionByLoggedInUserId(loggedInUserId: number): Promise<SessionData | null> {
    try {
      const indexKey = `${this.loggedInUserIdIndexPrefix}${loggedInUserId}`;
      const requestId = await this.redis.get(indexKey);
      if (requestId) {
        const session = await this.getSession(requestId);
        if (session && session.state !== 'completed' && session.state !== 'failed') {
          return session;
        }
      }
      
      // Fallback: scan all sessions (for migration/backward compatibility)
      const pattern = `${this.sessionKeyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        // Skip index keys - they only contain requestId, not full session data
        if (key.startsWith(this.telegramUserIdIndexPrefix) || key.startsWith(this.loggedInUserIdIndexPrefix)) {
          continue;
        }
        const data = await this.redis.get(key);
        if (data) {
          const session = JSON.parse(data) as SessionData;
          if (session.loggedInUserId === loggedInUserId && session.state !== 'completed' && session.state !== 'failed') {
            return session;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error('Redis error in getActiveSessionByLoggedInUserId', {
        error: error instanceof Error ? error.message : String(error),
        loggedInUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get completed session by loggedInUserId (returns the most recent completed session)
   * Used to check if a telegram user is logged in as another user
   */
  async getCompletedSessionByLoggedInUserId(loggedInUserId: number): Promise<SessionData | null> {
    const indexKey = `${this.loggedInUserIdIndexPrefix}${loggedInUserId}`;
    const requestId = await this.redis.get(indexKey);
    if (requestId) {
      const session = await this.getSession(requestId);
      if (session && session.state === 'completed') {
        return session;
      }
    }
    
    // Fallback: scan all sessions
    const pattern = `${this.sessionKeyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      // Skip index keys - they only contain requestId, not full session data
      if (key.startsWith(this.telegramUserIdIndexPrefix) || key.startsWith(this.loggedInUserIdIndexPrefix)) {
        continue;
      }
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data) as SessionData;
        if (session.loggedInUserId === loggedInUserId && session.state === 'completed') {
          return session;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a telegram user is logged in (has a completed session)
   * Returns the logged-in user ID if logged in, null otherwise
   */
  async isLoggedIn(telegramUserId: number): Promise<number | null> {
    const session = await this.getSessionByTelegramUserId(telegramUserId);
    if (session && session.state === 'completed') {
      return session.loggedInUserId;
    }
    return null;
  }

  /**
   * Update session state
   */
  async updateSessionState(
    requestId: string,
    state: SessionState,
  ): Promise<void> {
    const session = await this.getSession(requestId);
    if (!session) {
      throw new Error(`Session not found for requestId: ${requestId}`);
    }
    session.state = state;
    
    // Update TTL based on state
    const ttl = state === 'completed' ? this.completedSessionTtlSeconds : this.sessionTtlSeconds;
    const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
    await this.redis.set(sessionKey, JSON.stringify(session), ttl);
    
    // Update index TTLs
    await this.redis.set(
      `${this.telegramUserIdIndexPrefix}${session.telegramUserId}`,
      requestId,
      ttl,
    );
    await this.redis.set(
      `${this.loggedInUserIdIndexPrefix}${session.loggedInUserId}`,
      requestId,
      ttl,
    );
  }

  /**
   * Delete a session
   */
  async deleteSession(requestId: string): Promise<void> {
    const session = await this.getSession(requestId);
    if (session) {
      const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
      await this.redis.del(sessionKey);
      
      // Clear indexes
      await this.redis.del(`${this.telegramUserIdIndexPrefix}${session.telegramUserId}`);
      await this.redis.del(`${this.loggedInUserIdIndexPrefix}${session.loggedInUserId}`);
    }
  }

  /**
   * Check if a session exists
   */
  async sessionExists(requestId: string): Promise<boolean> {
    const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
    return await this.redis.exists(sessionKey);
  }
}
