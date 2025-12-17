/**
 * Abstract repository for Redis operations
 * Provides a clean interface for Redis key-value operations
 */
export abstract class RedisRepository {
  /**
   * Get a value by key
   */
  abstract get(key: string): Promise<string | null>;

  /**
   * Set a value with optional TTL in seconds
   */
  abstract set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a key
   */
  abstract del(key: string): Promise<void>;

  /**
   * Check if a key exists
   */
  abstract exists(key: string): Promise<boolean>;
}
