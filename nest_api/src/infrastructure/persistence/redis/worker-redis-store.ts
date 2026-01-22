import { Injectable } from '@nestjs/common';
import { WorkerRepository } from '../worker.repository';
import { RedisRepository } from './redis.repository';

/**
 * Redis implementation of WorkerRepository
 * Single Responsibility: worker port assignments and port allocation state using Redis
 */
@Injectable()
export class WorkerRedisStore extends WorkerRepository {
  private readonly workerPortKeyPrefix = 'worker:port:';
  private readonly nextPortKey = 'worker:nextPort';

  constructor(private readonly redis: RedisRepository) {
    super();
  }

  /**
   * Get the HTTP port assigned to a worker for a given userId
   */
  async getWorkerPort(userId: string): Promise<number | null> {
    const key = `${this.workerPortKeyPrefix}${userId}`;
    const data = await this.redis.get(key);
    if (!data) {
      return null;
    }
    try {
      return Number.parseInt(data, 10);
    } catch {
      return null;
    }
  }

  /**
   * Set the HTTP port for a worker
   */
  async setWorkerPort(userId: string, port: number): Promise<void> {
    const key = `${this.workerPortKeyPrefix}${userId}`;
    await this.redis.set(key, port.toString());
  }

  /**
   * Get the next available port number
   */
  async getNextPort(): Promise<number | null> {
    const data = await this.redis.get(this.nextPortKey);
    if (!data) {
      return null;
    }
    try {
      return Number.parseInt(data, 10);
    } catch {
      return null;
    }
  }

  /**
   * Delete worker port assignment
   */
  async deleteWorkerPort(userId: string): Promise<void> {
    const key = `${this.workerPortKeyPrefix}${userId}`;
    await this.redis.del(key);
  }

  /**
   * Get all worker user IDs that have port assignments
   */
  async getAllWorkers(): Promise<string[]> {
    const pattern = `${this.workerPortKeyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    
    // Extract userId from keys (format: worker:port:{userId})
    return keys.map((key) => key.replace(this.workerPortKeyPrefix, ''));
  }
}

