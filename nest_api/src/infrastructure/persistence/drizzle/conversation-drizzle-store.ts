import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, desc, notInArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DrizzleQueryError } from 'drizzle-orm';
import { ConversationRepository, ConversationData, ConversationState } from '../conversation.repository';
import { sessions } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of ConversationRepository
 * Single Responsibility: unified conversation data operations using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class ConversationDrizzleStore extends ConversationRepository {
  private readonly logger = new Logger(ConversationDrizzleStore.name);
  private readonly conversationTtlSeconds = 30 * 60; // 30 minutes TTL for active conversations
  private readonly completedConversationTtlSeconds = 365 * 24 * 60 * 60; // 1 year TTL for completed conversations (persistent login)

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Store a conversation
   * This will cancel any existing active conversations for the same telegramUserId to ensure only one conversation exists per telegram user.
   * Also cancels any existing active conversations for the same loggedInUserId to ensure only one active conversation exists per logged-in user.
   */
  async setConversation(conversation: ConversationData): Promise<void> {
    // CRITICAL: Cancel any existing active conversations for this telegramUserId to ensure uniqueness per telegram user
    // This is the primary constraint - a telegram user must have only one conversation at a time
    // Skip this check for web conversations (no telegramUserId)
    if (conversation.telegramUserId !== undefined) {
      const existingConversationByTelegramUserId = await this.getConversationByTelegramUserId(conversation.telegramUserId);
      if (existingConversationByTelegramUserId &&
          existingConversationByTelegramUserId.requestId !== conversation.requestId &&
          existingConversationByTelegramUserId.state !== 'completed' &&
          existingConversationByTelegramUserId.state !== 'failed') {
        // Mark existing conversation as failed since a new one is being created for the same telegram user
        await this.db
          .update(sessions)
          .set({
            state: 'failed',
            updatedAt: new Date(),
          })
          .where(eq(sessions.requestId, existingConversationByTelegramUserId.requestId));
      }
    }

    // Also cancel any existing active conversations for this loggedInUserId (in case user logs in as different user)
    const existingActiveConversation = await this.getActiveConversationByLoggedInUserId(conversation.loggedInUserId);
    if (existingActiveConversation && 
        existingActiveConversation.requestId !== conversation.requestId &&
        existingActiveConversation.telegramUserId !== conversation.telegramUserId) {
      // Mark existing conversation as failed since a new one is being created for a different telegram user
      await this.db
        .update(sessions)
        .set({
          state: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(sessions.requestId, existingActiveConversation.requestId));
    }

    const ttl = conversation.state === 'completed' ? this.completedConversationTtlSeconds : this.conversationTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Insert or update conversation
    await this.db
      .insert(sessions)
      .values({
        requestId: conversation.requestId,
        loggedInUserId: conversation.loggedInUserId,
        telegramUserId: conversation.telegramUserId,
        phoneNumber: conversation.phoneNumber,
        chatId: conversation.chatId,
        source: conversation.source ?? 'telegram',
        state: conversation.state,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [sessions.requestId],
        set: {
          loggedInUserId: conversation.loggedInUserId,
          telegramUserId: conversation.telegramUserId,
          phoneNumber: conversation.phoneNumber,
          chatId: conversation.chatId,
          source: conversation.source ?? 'telegram',
          state: conversation.state,
          updatedAt: new Date(),
          expiresAt,
        },
      });
  }

  /**
   * Get a conversation by requestId
   */
  async getConversation(requestId: string): Promise<ConversationData | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.requestId, requestId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    // Check if session has expired
    if (row.expiresAt && row.expiresAt < new Date()) {
      return null;
    }

    return this.mapRowToConversationData(row);
  }

  /**
   * Get a conversation by telegramUserId (the user interacting with the bot)
   * Returns the most recent active conversation
   */
  async getConversationByTelegramUserId(telegramUserId: number): Promise<ConversationData | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.telegramUserId, telegramUserId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    // Check if session has expired
    if (row.expiresAt && row.expiresAt < new Date()) {
      return null;
    }

    return this.mapRowToConversationData(row);
  }

  /**
   * Get active conversation by loggedInUserId (returns the most recent non-completed conversation)
   */
  async getActiveConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    try {
      const result = await this.db
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.loggedInUserId, loggedInUserId),
            notInArray(sessions.state, ['completed', 'failed']),
          ),
        )
        .orderBy(desc(sessions.createdAt))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];

      // Check if session has expired
      if (row.expiresAt && row.expiresAt < new Date()) {
        return null;
      }

      return this.mapRowToConversationData(row);
    } catch (error: unknown) {
      // Log all error properties to help debug
      const errorDetails: Record<string, unknown> = {
        errorType: error && typeof error === 'object' && 'constructor' in error ? error.constructor.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        loggedInUserId,
      };

      if (error instanceof DrizzleQueryError) {
        errorDetails.query = error.query;
        errorDetails.params = error.params;
        errorDetails.stack = error.stack;
        
        // Try to get underlying PostgreSQL error
        const cause = 'cause' in error ? error.cause : undefined;
        if (cause) {
          const causeObj = cause as unknown as Record<string, unknown>;
          errorDetails.underlyingError = {
            name: causeObj?.constructor && typeof causeObj.constructor === 'function' && 'name' in causeObj.constructor ? causeObj.constructor.name : undefined,
            message: causeObj?.message,
            code: causeObj?.code,
            detail: causeObj?.detail,
            hint: causeObj?.hint,
            position: causeObj?.position,
            severity: causeObj?.severity,
            stack: causeObj?.stack,
            // Log all properties of the cause
            allProperties: Object.keys(causeObj || {}),
          };
        }
        
        // Also check if error has direct PostgreSQL error properties
        const errorObj = error as unknown as Record<string, unknown>;
        if (errorObj.code) {
          errorDetails.postgresErrorCode = errorObj.code;
        }
        if (errorObj.detail) {
          errorDetails.postgresDetail = errorObj.detail;
        }
        
        this.logger.error('Database query error in getActiveSessionByLoggedInUserId', errorDetails);
      } else {
        errorDetails.name = error instanceof Error ? error.name : undefined;
        errorDetails.stack = error instanceof Error ? error.stack : undefined;
        
        // Check for cause property
        if (error && typeof error === 'object' && 'cause' in error && error.cause) {
          const causeObj = error.cause as Record<string, unknown>;
          errorDetails.cause = {
            name: causeObj?.constructor && typeof causeObj.constructor === 'function' && 'name' in causeObj.constructor ? causeObj.constructor.name : undefined,
            message: causeObj?.message,
            code: causeObj?.code,
            detail: causeObj?.detail,
            stack: causeObj?.stack,
            allProperties: Object.keys(causeObj || {}),
          };
        }
        
        // Log all error properties
        if (error && typeof error === 'object') {
          errorDetails.allErrorProperties = Object.keys(error);
        }
        
        this.logger.error('Unexpected error in getActiveSessionByLoggedInUserId', errorDetails);
      }
      throw error;
    }
  }

  /**
   * Get completed conversation by loggedInUserId (returns the most recent completed conversation)
   * Used to check if a telegram user is logged in as another user
   */
  async getCompletedConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.loggedInUserId, loggedInUserId),
          eq(sessions.state, 'completed'),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];

    // Check if session has expired
    if (row.expiresAt && row.expiresAt < new Date()) {
      return null;
    }

    return this.mapRowToConversationData(row);
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

    const ttl = state === 'completed' ? this.completedConversationTtlSeconds : this.conversationTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.db
      .update(sessions)
      .set({
        state,
        updatedAt: new Date(),
        expiresAt,
      })
      .where(eq(sessions.requestId, requestId));
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(requestId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.requestId, requestId));
  }

  /**
   * Check if a conversation exists
   */
  async conversationExists(requestId: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.requestId, requestId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    const row = result[0];
    // Check if session has expired
    if (row.expiresAt && row.expiresAt < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Map database row to ConversationData
   */
  private mapRowToConversationData(row: typeof sessions.$inferSelect): ConversationData {
    return {
      requestId: row.requestId,
      loggedInUserId: row.loggedInUserId,
      telegramUserId: row.telegramUserId ?? undefined,
      phoneNumber: row.phoneNumber ?? undefined,
      chatId: row.chatId ?? undefined,
      source: (row.source as 'web' | 'telegram') ?? undefined,
      state: row.state as ConversationState,
    };
  }
}

