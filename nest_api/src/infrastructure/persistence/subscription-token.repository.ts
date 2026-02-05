/**
 * Subscription token data structure
 * Used for web-based subscription page access
 */
export interface SubscriptionTokenData {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Token validation result
 */
export interface SubscriptionTokenValidationResult {
  valid: boolean;
  error?: 'not_found' | 'expired';
  token?: SubscriptionTokenData;
}

/**
 * Abstract repository for subscription token operations
 */
export abstract class SubscriptionTokenRepository {
  /**
   * Create a new subscription token for a user
   * @param userId - The Telegram user ID
   * @param ttlMinutes - Time to live in minutes (default: 60)
   * @returns The generated token and expiration date
   */
  abstract createToken(
    userId: string,
    ttlMinutes?: number,
  ): Promise<{ token: string; expiresAt: Date }>;

  /**
   * Validate a token and return the user ID
   * @param token - The token to validate
   * @returns Validation result with user ID if valid
   */
  abstract validateToken(token: string): Promise<SubscriptionTokenValidationResult>;

  /**
   * Get a token by its value
   * @param token - The token to retrieve
   */
  abstract getToken(token: string): Promise<SubscriptionTokenData | null>;

  /**
   * Get the user ID from a token
   * @param token - The token to get user ID from
   */
  abstract getUserIdFromToken(token: string): Promise<string | null>;

  /**
   * Delete expired tokens (cleanup job)
   * @returns Number of tokens deleted
   */
  abstract cleanupExpiredTokens(): Promise<number>;

  /**
   * Delete all tokens for a specific user
   * @param userId - The user ID
   */
  abstract deleteTokensByUserId(userId: string): Promise<void>;

  /**
   * Refresh a token (extend expiration)
   * @param token - The token to refresh
   * @param ttlMinutes - New TTL in minutes
   */
  abstract refreshToken(token: string, ttlMinutes?: number): Promise<SubscriptionTokenData | null>;
}
