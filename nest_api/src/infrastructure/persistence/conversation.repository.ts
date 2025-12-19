/**
 * Session state - unified state for both conversation flow and login process
 */
export type SessionState = 
  | 'idle'                    // No active session
  | 'waitingPhone'            // Waiting for phone number input
  | 'waitingCode'             // Waiting for authentication code
  | 'waitingPassword'         // Waiting for password (2FA)
  | 'completed'               // Login completed successfully
  | 'failed';                 // Login failed

/**
 * Unified session data structure
 * Merges conversation state and login session data into a single model
 */
export interface SessionData {
  // Identifiers
  requestId: string;                    // Unique session identifier
  loggedInUserId: number;                // The Telegram user ID that is logged in (impersonated user) - the user the worker is configured to impersonate
  telegramUserId: number;                // Telegram user ID (number) - the user interacting with the bot (from ctx.from.id)
  
  // Login information (only present during login flow)
  phoneNumber?: string;                  // Phone number being used for login
  
  // Conversation context
  chatId: number;                        // Chat ID where the conversation is happening
  
  // Session state
  state: SessionState;                   // Current state of the session
}

/**
 * Abstract repository for session data operations
 * Unified model: session data contains both conversation state and login information
 */
export abstract class ConversationRepository {
  /**
   * Store a session
   * This will cancel any existing active sessions for the same loggedInUserId to ensure only one active session exists
   */
  abstract setSession(session: SessionData): Promise<void>;

  /**
   * Get a session by requestId
   */
  abstract getSession(requestId: string): Promise<SessionData | null>;

  /**
   * Get a session by telegramUserId (the user interacting with the bot)
   * Returns the most recent active session
   */
  abstract getSessionByTelegramUserId(telegramUserId: number): Promise<SessionData | null>;

  /**
   * Get active session by loggedInUserId (returns the most recent non-completed session)
   */
  abstract getActiveSessionByLoggedInUserId(loggedInUserId: number): Promise<SessionData | null>;

  /**
   * Get completed session by loggedInUserId (returns the most recent completed session)
   * Used to check if a telegram user is logged in as another user
   */
  abstract getCompletedSessionByLoggedInUserId(loggedInUserId: number): Promise<SessionData | null>;

  /**
   * Check if a telegram user is logged in (has a completed session)
   * Returns the logged-in user ID if logged in, null otherwise
   */
  abstract isLoggedIn(telegramUserId: number): Promise<number | null>;

  /**
   * Update session state
   */
  abstract updateSessionState(
    requestId: string,
    state: SessionState,
  ): Promise<void>;

  /**
   * Delete a session
   */
  abstract deleteSession(requestId: string): Promise<void>;

  /**
   * Check if a session exists
   */
  abstract sessionExists(requestId: string): Promise<boolean>;
}
