import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
import { MessageEnqueuedLogRepository } from '@/infrastructure/persistence/message-enqueued-log.repository';

/**
 * Service for publishing messages to RabbitMQ queues
 * Single Responsibility: publishing messages to RabbitMQ
 */
@Injectable()
export class RabbitMQPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQPublisherService.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly assertedQueues = new Set<string>();
  private readonly rabbitmqConfig: {
    urls: string[];
    queueOptions: {
      durable: boolean;
    };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly messageEnqueuedLogRepository: MessageEnqueuedLogRepository,
  ) {
    const host = this.configService.get<string>('RABBITMQ_HOST') || 'localhost';
    const port = this.configService.get<string>('RABBITMQ_PORT') || '5672';
    const user = this.configService.get<string>('RABBITMQ_USER') || 'guest';
    const password = this.configService.get<string>('RABBITMQ_PASSWORD') || 'guest';
    
    // URL encode username and password to handle special characters
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);
    const url = `amqp://${encodedUser}:${encodedPassword}@${host}:${port}`;
    
    // Log connection details (without password) for debugging
    this.logger.log(`RabbitMQ connection config: host=${host}, port=${port}, user=${user}`);
    
    this.rabbitmqConfig = {
      urls: [url],
      queueOptions: {
        durable: true,
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const connectionUrl = this.rabbitmqConfig.urls[0];
      // Log connection URL without password for debugging
      const urlWithoutPassword = connectionUrl.replace(/:[^:@]+@/, ':****@');
      this.logger.log(`Attempting to connect to RabbitMQ: ${urlWithoutPassword}`);
      
      this.connection = await connect(connectionUrl);
      this.channel = await this.connection.createChannel();
      
      // Set up error handlers
      this.connection.on('error', (err) => {
        this.logger.error(`RabbitMQ connection error: ${err}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.channel.on('error', (err) => {
        this.logger.error(`RabbitMQ channel error: ${err}`);
        this.handleConnectionError();
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
        this.handleConnectionError();
      });

      this.logger.log('Connected to RabbitMQ for publishing');
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      this.logger.error(`Failed to connect to RabbitMQ: ${error}`);
      this.logger.error(`Connection URL (masked): ${this.rabbitmqConfig.urls[0].replace(/:[^:@]+@/, ':****@')}`);
      // Schedule reconnection
      this.scheduleReconnect();
      throw error;
    }
  }

  private handleConnectionError(): void {
    if (this.channel) {
      this.channel = null;
    }
    if (this.connection) {
      this.connection = null;
    }
    this.assertedQueues.clear();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    this.logger.log('Scheduling RabbitMQ reconnection in 5 seconds...');
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (!this.connection || !this.channel) {
        try {
          await this.connect();
        } catch (error) {
          this.logger.error(`Reconnection failed, will retry: ${error}`);
        }
      }
    }, 5000);
  }

  /**
   * Publishes a message to a queue
   */
  async publishToQueue<T>(queueName: string, data: T): Promise<void> {
    // Ensure connection is established
    if (!this.channel || !this.connection) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      // Assert queue only on first use (per connection)
      if (!this.assertedQueues.has(queueName)) {
        await this.channel.assertQueue(queueName, this.rabbitmqConfig.queueOptions);
        this.assertedQueues.add(queueName);
      }

      const message = Buffer.from(JSON.stringify(data));
      this.channel.sendToQueue(queueName, message, {
        persistent: true,
      });

      // Log enqueued message
      await this.messageEnqueuedLogRepository.logEnqueuedMessage({
        queueName,
        messageData: data,
        userId: this.extractUserId(data),
      }).catch((logError) => {
        this.logger.error(`[ERROR] Failed to log enqueued message: ${logError}`);
      });
    } catch (error) {
      this.logger.error(`[ERROR] Error publishing to queue ${queueName}: ${error}`);
      // Try to reconnect and retry once
      if (!this.isConnecting) {
        this.handleConnectionError();
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.channel) {
          try {
            await this.channel.assertQueue(queueName, this.rabbitmqConfig.queueOptions);
            this.assertedQueues.add(queueName);
            const message = Buffer.from(JSON.stringify(data));
            this.channel.sendToQueue(queueName, message, {
              persistent: true,
            });

            // Log enqueued message
            await this.messageEnqueuedLogRepository.logEnqueuedMessage({
              queueName,
              messageData: data,
              userId: this.extractUserId(data),
            }).catch((logError) => {
              this.logger.error(`[ERROR] Failed to log enqueued message: ${logError}`);
            });

            return;
          } catch (retryError) {
            this.logger.error(`[ERROR] Retry failed: ${retryError}`);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Gets or creates a channel for advanced operations
   */
  getChannel(): Channel {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }
    return this.channel;
  }

  /**
   * Extract user ID from message data if available
   */
  private extractUserId(data: unknown): string | undefined {
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      // Try common patterns for user ID
      if (obj.userId && typeof obj.userId === 'string') {
        return obj.userId;
      }
      if (obj.from && typeof obj.from === 'object') {
        const from = obj.from as Record<string, unknown>;
        if (from.id) {
          return String(from.id);
        }
      }
      if (obj.update && typeof obj.update === 'object') {
        const update = obj.update as Record<string, unknown>;
        if (update.message && typeof update.message === 'object') {
          const message = update.message as Record<string, unknown>;
          if (message.from && typeof message.from === 'object') {
            const from = message.from as Record<string, unknown>;
            if (from.id) {
              return String(from.id);
            }
          }
        }
      }
    }
    return undefined;
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(`Error disconnecting from RabbitMQ: ${error}`);
    }
  }
}

