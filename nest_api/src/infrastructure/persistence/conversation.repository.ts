/**
 * Conversation state - unified state for login process
 */
export type ConversationState = 
  | 'idle'                    // No active conversation
  | 'waitingPhone'            // Waiting for phone number input
  | 'waitingCode'             // Waiting for authentication code
  | 'waitingPassword'         // Waiting for password (2FA)
  | 'completed'               // Login completed successfully
  | 'failed';                 // Login failed

/**
 * Conversation data structure
 * Tracks login conversation state
 */
export interface ConversationData {
  // Identifiers
  requestId: string;                    // Unique conversation identifier
  loggedInUserId: number;                // The Telegram user ID that is logged in (impersonated user) - the user the worker is configured to impersonate
  telegramUserId?: number;               // Telegram user ID (number) - the user interacting with the bot (from ctx.from.id). Optional for web logins.

  // Login information (only present during login flow)
  phoneNumber?: string;                  // Phone number being used for login

  // Conversation context
  chatId?: number;                       // Chat ID where the conversation is happening. Optional for web logins.

  // Source of the conversation
  source?: 'web' | 'telegram';           // Where the login was initiated from

  // Conversation state
  state: ConversationState;                   // Current state of the conversation
}

/**
 * Abstract repository for conversation data operations
 */
export abstract class ConversationRepository {
  /**
   * Store a conversation
   * This will cancel any existing active conversations for the same telegramUserId to ensure only one conversation exists per telegram user.
   * Also cancels any existing active conversations for the same loggedInUserId to ensure only one active conversation exists per logged-in user.
   */
  abstract setConversation(conversation: ConversationData): Promise<void>;

  /**
   * Get a conversation by requestId
   */
  abstract getConversation(requestId: string): Promise<ConversationData | null>;

  /**
   * Get a conversation by telegramUserId (the user interacting with the bot)
   * Returns the most recent active conversation
   */
  abstract getConversationByTelegramUserId(telegramUserId: number): Promise<ConversationData | null>;

  /**
   * Get active conversation by loggedInUserId (returns the most recent non-completed conversation)
   */
  abstract getActiveConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null>;

  /**
   * Get completed conversation by loggedInUserId (returns the most recent completed conversation)
   * Used to check if a telegram user is logged in as another user
   */
  abstract getCompletedConversationByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null>;

  /**
   * Check if a telegram user is logged in (has a completed conversation)
   * Returns the logged-in user ID if logged in, null otherwise
   */
  abstract isLoggedIn(telegramUserId: number): Promise<number | null>;

  /**
   * Update conversation state
   */
  abstract updateConversationState(
    requestId: string,
    state: ConversationState,
  ): Promise<void>;

  /**
   * Delete a conversation
   */
  abstract deleteConversation(requestId: string): Promise<void>;

  /**
   * Check if a conversation exists
   */
  abstract conversationExists(requestId: string): Promise<boolean>;

  // Legacy method names for backward compatibility (deprecated)
  /** @deprecated Use setConversation instead */
  async setSession(session: ConversationData): Promise<void> {
    return this.setConversation(session);
  }

  /** @deprecated Use getConversation instead */
  async getSession(requestId: string): Promise<ConversationData | null> {
    return this.getConversation(requestId);
  }

  /** @deprecated Use getConversationByTelegramUserId instead */
  async getSessionByTelegramUserId(telegramUserId: number): Promise<ConversationData | null> {
    return this.getConversationByTelegramUserId(telegramUserId);
  }

  /** @deprecated Use getActiveConversationByLoggedInUserId instead */
  async getActiveSessionByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    return this.getActiveConversationByLoggedInUserId(loggedInUserId);
  }

  /** @deprecated Use getCompletedConversationByLoggedInUserId instead */
  async getCompletedSessionByLoggedInUserId(loggedInUserId: number): Promise<ConversationData | null> {
    return this.getCompletedConversationByLoggedInUserId(loggedInUserId);
  }

  /** @deprecated Use updateConversationState instead */
  async updateSessionState(requestId: string, state: ConversationState): Promise<void> {
    return this.updateConversationState(requestId, state);
  }

  /** @deprecated Use deleteConversation instead */
  async deleteSession(requestId: string): Promise<void> {
    return this.deleteConversation(requestId);
  }

  /** @deprecated Use conversationExists instead */
  async sessionExists(requestId: string): Promise<boolean> {
    return this.conversationExists(requestId);
  }
}
