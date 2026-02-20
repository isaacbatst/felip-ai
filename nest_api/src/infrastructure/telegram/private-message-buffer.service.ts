import { Injectable, Logger } from '@nestjs/common';

interface BufferEntry {
  timestamp: number;
}

/**
 * In-memory deduplication buffer for private messages.
 * Keyed by "{botOwnerId}:{sellerId}:{messageType}".
 * TTL is provided per call so each user's configured window is respected.
 */
@Injectable()
export class PrivateMessageBufferService {
  private readonly logger = new Logger(PrivateMessageBufferService.name);
  private readonly cache = new Map<string, BufferEntry>();

  /**
   * Returns true if a PM for this key was already sent within ttlMs.
   * Returns false and records the current timestamp when the key is new or expired.
   */
  shouldSkip(key: string, ttlMs: number): boolean {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < ttlMs) {
      this.logger.log(`Dedup: skipping PM for key=${key}, ttlMs=${ttlMs}`);
      return true;
    }
    this.cache.set(key, { timestamp: Date.now() });
    return false;
  }

  clear(key: string): void {
    this.cache.delete(key);
  }
}
