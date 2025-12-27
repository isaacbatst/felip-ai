import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

interface SubmittedCodeEntry {
  code: string;
  timestamp: number;
}

/**
 * In-memory service for tracking submitted authentication codes to prevent duplicates
 * Thread-safe using Map operations (JavaScript is single-threaded, but we use atomic operations)
 */
@Injectable()
export class AuthCodeDeduplicationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCodeDeduplicationService.name);
  private readonly submittedCodes = new Map<string, SubmittedCodeEntry>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs = 60 * 1000; // Clean up every minute

  onModuleInit(): void {
    // Start cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.cleanupIntervalMs);
    this.logger.log('AuthCodeDeduplicationService initialized');
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.submittedCodes.clear();
    this.logger.log('AuthCodeDeduplicationService destroyed');
  }

  /**
   * Atomically check if a code was already submitted and mark it as submitted if not
   * Returns true if the code was set (first submission), false if it already existed
   * @param requestId - The request ID to use as the key
   * @param code - The normalized code value
   * @returns true if code was set, false if already exists
   */
  setIfNotExists(requestId: string, code: string): boolean {
    const key = requestId;
    
    // Atomic check-and-set: if key doesn't exist, set it
    if (!this.submittedCodes.has(key)) {
      this.submittedCodes.set(key, {
        code,
        timestamp: Date.now(),
      });
      return true;
    }
    
    return false;
  }

  /**
   * Remove a submitted code entry (allows retry)
   * @param requestId - The request ID to remove
   */
  delete(requestId: string): void {
    this.submittedCodes.delete(requestId);
  }

  /**
   * Check if a code was already submitted
   * @param requestId - The request ID to check
   * @returns true if code was submitted, false otherwise
   */
  has(requestId: string): boolean {
    const entry = this.submittedCodes.get(requestId);
    if (!entry) {
      return false;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.submittedCodes.delete(requestId);
      return false;
    }
    
    return true;
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.submittedCodes.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.submittedCodes.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired auth code entries`);
    }
  }

  /**
   * Get the number of tracked codes (for debugging/monitoring)
   */
  getSize(): number {
    return this.submittedCodes.size;
  }
}

