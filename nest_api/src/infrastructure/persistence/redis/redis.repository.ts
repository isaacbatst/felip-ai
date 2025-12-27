import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisClientType, createClient } from 'redis';

/**
 * Abstract repository for Redis operations
 * Provides a clean interface for Redis key-value operations
 */
@Injectable()
export class RedisRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisRepository.name);
  private readonly redis: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    this.redis = createClient({
      socket: {
        host: this.configService.get<string>('REDIS_HOST') || 'localhost',
        port: Number.parseInt(this.configService.get<string>('REDIS_PORT') || '6379', 10),
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 50, 2000);
          return delay;
        },
      },
      password: this.configService.get<string>('REDIS_PASSWORD'),
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connecting');
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis connected and ready');
    });
  }

  /**
   * Initialize Redis connection on module init
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * Cleanup Redis connection on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Failed to get key ${key}`, error);
      throw error;
    }
  }

  /**
   * Set a value with optional TTL in seconds
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds !== undefined) {
        await this.redis.setEx(key, ttlSeconds, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Failed to set key ${key}`, error);
      throw error;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Failed to delete key ${key}`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check existence of key ${key}`, error);
      throw error;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to get keys with pattern ${pattern}`, error);
      throw error;
    }
  }

  /**
   * Set a value only if the key does not exist (atomic operation)
   * Returns true if the key was set, false if it already existed
   * @param key - The key to set
   * @param value - The value to set
   * @param ttlSeconds - Optional TTL in seconds
   * @returns true if key was set, false if key already existed
   */
  async setIfNotExists(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      let result: string | null;
      if (ttlSeconds !== undefined) {
        // SET key value NX EX ttl - atomic operation: only set if not exists, with expiration
        // Returns "OK" if set, null if key already exists
        result = await this.redis.set(key, value, {
          NX: true,
          EX: ttlSeconds,
        });
      } else {
        // SET key value NX - atomic operation: only set if not exists
        // Returns "OK" if set, null if key already exists
        result = await this.redis.set(key, value, {
          NX: true,
        });
      }
      // Return true if result is "OK" (key was set), false if null (key already existed)
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Failed to set key ${key} if not exists`, error);
      throw error;
    }
  }
}
