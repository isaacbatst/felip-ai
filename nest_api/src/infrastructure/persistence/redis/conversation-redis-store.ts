import { Injectable, Logger } from '@nestjs/common';
import { ConversationRepository, ConversationData, ConversationState } from '../conversation.repository';
import { RedisRepository } from './redis.repository';

/**
 * Redis implementation of ConversationRepository
 * Single Responsibility: unified conversation data operations using Redis
 */
@Injectable()
export class ConversationRedisStore extends ConversationRepository {
  private readonly logger = new Logger(ConversationRedisStore.name);
  private readonly conversationKeyPrefix = 'conversation:';
  private readonly telegramUserIdIndexPrefix = 'conversation:telegramUserId:';
  private readonly loggedInUserIdIndexPrefix = 'conversation:loggedInUserId:';
  private readonly conversationTtlSeconds = 30 * 60; // 30 minutes TTL for active conversations
  private readonly completedConversationTtlSeconds = 365 * 24 * 60 * 60; // 1 year TTL for completed conversations (persistent login)

  constructor(private readonly redis: RedisRepository) {
    super();
  }

  /**
   * Store a conversation
   * This will cancel any existing active conversations for the same telegramUserId to ensure only one conversation exists per telegram user.
   * Also cancels any existing active conversations for the same loggedInUserId to ensure only one active conversation exists per logged-in user.
   */
  async setConversation(conversation: ConversationData): Promise<void> {
    try {
      // CRITICAL: Cancel any existing active conversations for this telegramUserId to ensure uniqueness per telegram user
      // This is the primary constraint - a telegram user must have only one conversation at a time
      const existingConversationByTelegramUserId = conversation.telegramUserId !== undefined ? await this.getConversationByTelegramUserId(conversation.telegramUserId) : null;
      if (existingConversationByTelegramUserId && 
          existingConversationByTelegramUserId.requestId !== conversation.requestId &&
          existingConversationByTelegramUserId.state !== 'completed' &&
          existingConversationByTelegramUserId.state !== 'failed') {
        // Mark existing conversation as failed since a new one is being created for the same telegram user
        existingConversationByTelegramUserId.state = 'failed';
        await this.redis.set(
          `${this.conversationKeyPrefix}${existingConversationByTelegramUserId.requestId}`,
          JSON.stringify(existingConversationByTelegramUserId),
          this.conversationTtlSeconds,
        );
        // Clear indexes
        await this.redis.del(`${this.telegramUserIdIndexPrefix}${existingConversationByTelegramUserId.telegramUserId}`);
        await this.redis.del(`${this.loggedInUserIdIndexPrefix}${existingConversationByTelegramUserId.loggedInUserId}`);
      }

      // Also cancel any existing active conversations for this loggedInUserId (in case user logs in as different user)
      const existingActiveConversation = await this.getActiveConversationByLoggedInUserId(conversation.loggedInUserId);
      if (existingActiveConversation && 
          existingActiveConversation.requestId !== conversation.requestId &&
          existingActiveConversation.telegramUserId !== conversation.telegramUserId) {
        // Mark existing conversation as failed since a new one is being created for a different telegram user
        existingActiveConversation.state = 'failed';
        await this.redis.set(
          `${this.conversationKeyPrefix}${existingActiveConversation.requestId}`,
          JSON.stringify(existingActiveConversation),
          this.conversationTtlSeconds,
        );
        // Clear indexes
        await this.redis.del(`${this.telegramUserIdIndexPrefix}${existingActiveConversation.telegramUserId}`);
        await this.redis.del(`${this.loggedInUserIdIndexPrefix}${existingActiveConversation.loggedInUserId}`);
      }

      const conversationKey = `${this.conversationKeyPrefix}${conversation.requestId}`;
      const ttl = conversation.state === 'completed' ? this.completedConversationTtlSeconds : this.conversationTtlSeconds;

      // Store conversation data by requestId
      await this.redis.set(
        conversationKey,
        JSON.stringify(conversation),
        ttl,
      );

      // Store index: telegramUserId -> requestId (for quick lookup)
      await this.redis.set(
        `${this.telegramUserIdIndexPrefix}${conversation.telegramUserId}`,
        conversation.requestId,
        ttl,
      );

      // Store index: loggedInUserId -> requestId (for quick lookup)
      await this.redis.set(
        `${this.loggedInUserIdIndexPrefix}${conversation.loggedInUserId}`,
        conversation.requestId,
        ttl,
      );
    } catch (error) {
      this.logger.error('Redis error in setConversation', {
        error: error instanceof Error ? error.message : String(error),
        requestId: conversation.requestId,
        loggedInUserId: conversation.loggedInUserId,
        telegramUserId: conversation.telegramUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get a conversation by requestId
   */
  async getConversation(requestId: string): Promise<ConversationData | null> {
    try {
      const conversationKey = `${this.conversationKeyPrefix}${requestId}`;
      const data = await this.redis.get(conversationKey);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as ConversationData;
    } catch (error) {
      this.logger.error('Redis error in getConversation', {
        error: error instanceof Error ? error.message : String(error),
        requestId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get a conversation by telegramUserId (the user interacting with the bot)
   * Returns the most recent active conversation
   */
  async getConversationByTelegramUserId(telegramUserId: number): Promise<ConversationData | null> {
    try {
      const indexKey = `${this.telegramUserIdIndexPrefix}${telegramUserId}`;
      const requestId = await this.redis.get(indexKey);
      if (!requestId) {
        return null;
      }
      return this.getConversation(requestId);
    } catch (error) {
      this.logger.error('Redis error in getConversationByTelegramUserId', {
        error: error instanceof Error ? error.message : String(error),
        telegramUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get active conversation by loggedInUserId (returns the most recent non-completed conversation)
   */
  async getActiveConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    try {
      const indexKey = `${this.loggedInUserIdIndexPrefix}${loggedInUserId}`;
      const requestId = await this.redis.get(indexKey);
      if (requestId) {
        const conversation = await this.getConversation(requestId);
        if (conversation && conversation.state !== 'completed' && conversation.state !== 'failed') {
          return conversation;
        }
      }
      
      // Fallback: scan all conversations (for migration/backward compatibility)
      const pattern = `${this.conversationKeyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      for (const key of keys) {
        // Skip index keys - they only contain requestId, not full conversation data
        if (key.startsWith(this.telegramUserIdIndexPrefix) || key.startsWith(this.loggedInUserIdIndexPrefix)) {
          continue;
        }
        const data = await this.redis.get(key);
        if (data) {
          const conversation = JSON.parse(data) as ConversationData;
          if (conversation.loggedInUserId === loggedInUserId && conversation.state !== 'completed' && conversation.state !== 'failed') {
            return conversation;
          }
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error('Redis error in getActiveConversationByLoggedInUserId', {
        error: error instanceof Error ? error.message : String(error),
        loggedInUserId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get completed conversation by loggedInUserId (returns the most recent completed conversation)
   * Used to check if a telegram user is logged in as another user
   */
  async getCompletedConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    const indexKey = `${this.loggedInUserIdIndexPrefix}${loggedInUserId}`;
    const requestId = await this.redis.get(indexKey);
    if (requestId) {
      const conversation = await this.getConversation(requestId);
      if (conversation && conversation.state === 'completed') {
        return conversation;
      }
    }
    
    // Fallback: scan all conversations
    const pattern = `${this.conversationKeyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      // Skip index keys - they only contain requestId, not full conversation data
      if (key.startsWith(this.telegramUserIdIndexPrefix) || key.startsWith(this.loggedInUserIdIndexPrefix)) {
        continue;
      }
      const data = await this.redis.get(key);
      if (data) {
        const conversation = JSON.parse(data) as ConversationData;
        if (conversation.loggedInUserId === loggedInUserId && conversation.state === 'completed') {
          return conversation;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a telegram user is logged in (has a completed conversation)
   * Returns the logged-in user ID if logged in, null otherwise
   */
  async isLoggedIn(telegramUserId: number): Promise<number | null> {
    const conversation = await this.getConversationByTelegramUserId(telegramUserId);
    if (conversation && conversation.state === 'completed') {
      return conversation.loggedInUserId;
    }
    return null;
  }

  /**
   * Update conversation state
   */
  async updateConversationState(
    requestId: string,
    state: ConversationState,
  ): Promise<void> {
    const conversation = await this.getConversation(requestId);
    if (!conversation) {
      throw new Error(`Conversation not found for requestId: ${requestId}`);
    }
    conversation.state = state;
    
    // Update TTL based on state
    const ttl = state === 'completed' ? this.completedConversationTtlSeconds : this.conversationTtlSeconds;
    const conversationKey = `${this.conversationKeyPrefix}${requestId}`;
    await this.redis.set(conversationKey, JSON.stringify(conversation), ttl);
    
    // Update index TTLs
    await this.redis.set(
      `${this.telegramUserIdIndexPrefix}${conversation.telegramUserId}`,
      requestId,
      ttl,
    );
    await this.redis.set(
      `${this.loggedInUserIdIndexPrefix}${conversation.loggedInUserId}`,
      requestId,
      ttl,
    );
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(requestId: string): Promise<void> {
    const conversation = await this.getConversation(requestId);
    if (conversation) {
      const conversationKey = `${this.conversationKeyPrefix}${requestId}`;
      await this.redis.del(conversationKey);
      
      // Clear indexes
      await this.redis.del(`${this.telegramUserIdIndexPrefix}${conversation.telegramUserId}`);
      await this.redis.del(`${this.loggedInUserIdIndexPrefix}${conversation.loggedInUserId}`);
    }
  }

  /**
   * Check if a conversation exists
   */
  async conversationExists(requestId: string): Promise<boolean> {
    const conversationKey = `${this.conversationKeyPrefix}${requestId}`;
    return await this.redis.exists(conversationKey);
  }
}
