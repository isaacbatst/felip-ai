import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue as BullMQQueue } from 'bullmq';
import { Queue } from '../interfaces/queue.interface';

const DEFAULT_KEY = '__default__';

/**
 * BullMQ implementation of Queue
 * Single Responsibility: queue management using BullMQ/Redis
 * Supports key-based parallel queues: items with the same key are processed sequentially,
 * while items with different keys can be processed in parallel
 */
@Injectable()
export class QueueBullMQ<T> extends Queue<T> {
  private readonly logger = new Logger(QueueBullMQ.name);
  private readonly queues: Map<string, BullMQQueue> = new Map();
  private readonly queueName: string;
  private readonly redisConfig: { host: string; port: number; password?: string };

  constructor(
    queueName: string,
    configService: ConfigService,
  ) {
    super();
    this.queueName = queueName;
    this.redisConfig = {
      host: configService.get<string>('REDIS_HOST') || 'localhost',
      port: Number.parseInt(configService.get<string>('REDIS_PORT') || '6379', 10),
      password: configService.get<string>('REDIS_PASSWORD'),
    };
  }

  private getQueue(key: string = DEFAULT_KEY): BullMQQueue {
    // When using DEFAULT_KEY, use the base queue name to match @Processor decorators
    // For other keys, append the key to support key-based parallelization
    const queueKey = key === DEFAULT_KEY ? this.queueName : `${this.queueName}:${key}`;
    let queue = this.queues.get(queueKey);
    if (!queue) {
      queue = new BullMQQueue(queueKey, {
        connection: this.redisConfig,
      });
      this.queues.set(queueKey, queue);
    }
    return queue;
  }

  async enqueue(item: T, key?: string): Promise<void> {
    const queueKey = key ?? DEFAULT_KEY;
    const queue = this.getQueue(queueKey);
    await queue.add('job', item);
  }

  async dequeue(key?: string): Promise<T | null> {
    // BullMQ doesn't support direct dequeue - workers consume jobs
    // This method is kept for interface compatibility but shouldn't be used directly
    // Workers should be used instead
    this.logger.warn('dequeue() called on BullMQ queue - use workers instead');
    return null;
  }

  async size(key?: string): Promise<number> {
    const queueKey = key ?? DEFAULT_KEY;
    const queue = this.getQueue(queueKey);
    const counts = await queue.getJobCounts();
    return (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
  }

  async isEmpty(key?: string): Promise<boolean> {
    return (await this.size(key)) === 0;
  }

  /**
   * Gets the BullMQ queue instance for a specific key
   * Useful for creating workers
   */
  getBullMQQueue(key?: string): BullMQQueue {
    return this.getQueue(key);
  }
}

