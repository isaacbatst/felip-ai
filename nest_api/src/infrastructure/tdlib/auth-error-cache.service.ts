import { Injectable } from '@nestjs/common';

interface CachedError {
  error: string;
  timestamp: number;
}

/**
 * In-memory cache for transient auth errors (replaces DB storage).
 * Entries auto-expire after 5 minutes.
 */
@Injectable()
export class AuthErrorCacheService {
  private readonly cache = new Map<string, CachedError>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes

  set(userId: string, error: string): void {
    this.cache.set(userId, { error, timestamp: Date.now() });
  }

  get(userId: string): string | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(userId);
      return null;
    }
    return entry.error;
  }

  clear(userId: string): void {
    this.cache.delete(userId);
  }
}
