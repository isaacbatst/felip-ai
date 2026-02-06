export interface WebSessionValidationResult {
  valid: boolean;
  userId?: string;
}

/**
 * Abstract repository for web session operations
 */
export abstract class WebSessionRepository {
  abstract createSession(userId: string): Promise<{ token: string; expiresAt: Date }>;

  abstract validateSession(token: string): Promise<WebSessionValidationResult>;

  abstract refreshSession(token: string): Promise<void>;

  abstract deleteSession(token: string): Promise<void>;

  abstract deleteSessionsByUserId(userId: string): Promise<void>;

  abstract cleanupExpiredSessions(): Promise<void>;
}
