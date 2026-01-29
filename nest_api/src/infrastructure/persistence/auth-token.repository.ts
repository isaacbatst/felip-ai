import { ConversationData } from './conversation.repository';

/**
 * Auth token data structure
 * Used for web-based authentication code input
 */
export interface AuthTokenData {
  token: string;
  requestId: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  createdAt: Date;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean;
  error?: 'not_found' | 'expired' | 'already_used' | 'max_attempts';
  token?: AuthTokenData;
  session?: ConversationData;
}

/**
 * Abstract repository for auth token operations
 */
export abstract class AuthTokenRepository {
  /**
   * Create a new auth token for a session
   * @param requestId - The session requestId to associate with the token
   * @param ttlMinutes - Time to live in minutes (default: 10)
   * @returns The generated token and expiration date
   */
  abstract createToken(
    requestId: string,
    ttlMinutes?: number,
  ): Promise<{ token: string; expiresAt: Date }>;

  /**
   * Validate a token and return the associated session
   * @param token - The token to validate
   * @returns Validation result with error details if invalid
   */
  abstract validateToken(token: string): Promise<TokenValidationResult>;

  /**
   * Mark a token as used (one-time use)
   * @param token - The token to mark as used
   */
  abstract markTokenAsUsed(token: string): Promise<void>;

  /**
   * Increment the attempt counter for a token
   * @param token - The token to increment attempts for
   * @returns The new attempt count
   */
  abstract incrementAttempts(token: string): Promise<number>;

  /**
   * Get a token by its value
   * @param token - The token to retrieve
   */
  abstract getToken(token: string): Promise<AuthTokenData | null>;

  /**
   * Delete expired tokens (cleanup job)
   * @returns Number of tokens deleted
   */
  abstract cleanupExpiredTokens(): Promise<number>;

  /**
   * Delete all tokens for a specific session
   * @param requestId - The session requestId
   */
  abstract deleteTokensByRequestId(requestId: string): Promise<void>;
}
