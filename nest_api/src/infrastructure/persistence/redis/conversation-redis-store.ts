import { Injectable } from '@nestjs/common';
import { ConversationRepository, ConversationState, LoginSessionData } from '../conversation.repository';
import { RedisRepository } from './redis.repository';

/**
 * Redis implementation of ConversationRepository
 * Single Responsibility: conversation state and login session operations using Redis
 */
@Injectable()
export class ConversationRedisStore extends ConversationRepository {
  private readonly stateKeyPrefix = 'conversation:state:';
  private readonly requestIdKeyPrefix = 'conversation:auth-code-request-id:';
  private readonly sessionKeyPrefix = 'login:session:';
  private readonly stateTtlSeconds = 3600; // 1 hour TTL for state expiration
  // Match tdlib_worker TTL (30 minutes) to avoid conflicts when both services write to the same key
  private readonly requestIdTtlSeconds = 30 * 60; // 30 minutes TTL for requestId expiration (matches login session TTL)
  private readonly sessionTtlSeconds = 30 * 60; // 30 minutes TTL for session expiration

  constructor(private readonly redis: RedisRepository) {
    super();
  }

  /**
   * Define o estado de uma conversa para um usuário
   */
  async setState(userId: number, state: ConversationState): Promise<void> {
    const key = `${this.stateKeyPrefix}${userId}`;
    await this.redis.set(key, state, this.stateTtlSeconds);
  }

  /**
   * Obtém o estado atual de uma conversa para um usuário
   */
  async getState(userId: number): Promise<ConversationState> {
    const key = `${this.stateKeyPrefix}${userId}`;
    const state = await this.redis.get(key);
    if (!state) {
      return ConversationState.IDLE;
    }
    return state as ConversationState;
  }

  /**
   * Remove o estado de uma conversa (volta para IDLE)
   */
  async clearState(userId: number): Promise<void> {
    const key = `${this.stateKeyPrefix}${userId}`;
    await this.redis.del(key);
    // Also clear requestId when clearing state
    await this.clearPendingAuthCodeRequestId(userId);
  }

  /**
   * Define o requestId pendente de auth code para um usuário
   * 
   * Note: This key is used for mapping userId -> requestId for login sessions.
   * Format: plain string (requestId)
   * TTL: 30 minutes (aligned with login session TTL)
   */
  async setPendingAuthCodeRequestId(userId: number, requestId: string): Promise<void> {
    const key = `${this.requestIdKeyPrefix}${userId}`;
    await this.redis.set(key, requestId, this.requestIdTtlSeconds);
  }

  /**
   * Obtém o requestId pendente de auth code para um usuário
   */
  async getPendingAuthCodeRequestId(userId: number): Promise<string | undefined> {
    const key = `${this.requestIdKeyPrefix}${userId}`;
    const requestId = await this.redis.get(key);
    return requestId ?? undefined;
  }

  /**
   * Verifica se há um requestId pendente de auth code para um usuário
   */
  async hasPendingAuthCodeRequestId(userId: number): Promise<boolean> {
    const key = `${this.requestIdKeyPrefix}${userId}`;
    return await this.redis.exists(key);
  }

  /**
   * Remove o requestId pendente de auth code para um usuário
   */
  async clearPendingAuthCodeRequestId(userId: number): Promise<void> {
    const key = `${this.requestIdKeyPrefix}${userId}`;
    await this.redis.del(key);
  }

  /**
   * Store a login session
   */
  async setLoginSession(session: LoginSessionData): Promise<void> {
    const sessionKey = `${this.sessionKeyPrefix}${session.requestId}`;
    const userIdKey = `${this.requestIdKeyPrefix}${session.userId}`;

    // Store session data by requestId
    await this.redis.set(
      sessionKey,
      JSON.stringify(session),
      this.sessionTtlSeconds,
    );

    // Store reverse mapping: userId -> requestId (reuses existing key pattern)
    await this.redis.set(
      userIdKey,
      session.requestId,
      this.requestIdTtlSeconds,
    );
  }

  /**
   * Get a login session by requestId
   */
  async getLoginSession(requestId: string): Promise<LoginSessionData | null> {
    const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
    const data = await this.redis.get(sessionKey);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as LoginSessionData;
  }

  /**
   * Get a login session by userId
   */
  async getLoginSessionByUserId(userId: number): Promise<LoginSessionData | null> {
    const userIdKey = `${this.requestIdKeyPrefix}${userId}`;
    const requestId = await this.redis.get(userIdKey);
    if (!requestId) {
      return null;
    }
    return this.getLoginSession(requestId);
  }

  /**
   * Update login session state
   */
  async updateLoginSessionState(
    requestId: string,
    state: LoginSessionData['state'],
  ): Promise<void> {
    const session = await this.getLoginSession(requestId);
    if (!session) {
      throw new Error(`Session not found for requestId: ${requestId}`);
    }
    session.state = state;
    await this.setLoginSession(session);
  }

  /**
   * Delete a login session
   */
  async deleteLoginSession(requestId: string): Promise<void> {
    const session = await this.getLoginSession(requestId);
    if (session) {
      const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
      const userIdKey = `${this.requestIdKeyPrefix}${session.userId}`;
      await this.redis.del(sessionKey);
      await this.redis.del(userIdKey);
    }
  }

  /**
   * Check if a login session exists
   */
  async loginSessionExists(requestId: string): Promise<boolean> {
    const sessionKey = `${this.sessionKeyPrefix}${requestId}`;
    return await this.redis.exists(sessionKey);
  }
}
