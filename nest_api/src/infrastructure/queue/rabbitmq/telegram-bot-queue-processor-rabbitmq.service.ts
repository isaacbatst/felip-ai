import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel, ConsumeMessage } from 'amqplib';
import { Context } from 'grammy';
import { TelegramBotMessageHandler } from '../../telegram/handlers/telegram-bot-message.handler';

/**
 * RabbitMQ-based queue processor for Telegram bot messages
 * Single Responsibility: processing Telegram bot messages via RabbitMQ
 */
@Injectable()
export class TelegramBotQueueProcessorRabbitMQ implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotQueueProcessorRabbitMQ.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly queueName = 'telegram-bot-messages';
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000; // Base delay of 1 second
  private readonly rabbitmqConfig: {
    urls: string[];
    queueOptions: {
      durable: boolean;
    };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly messageHandler: TelegramBotMessageHandler,
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
    await this.setupConsumer();
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

      // Assert queue exists
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);

      this.logger.log(`Connected to RabbitMQ and asserted queue: ${this.queueName}`);
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      this.logger.error(`Failed to connect to RabbitMQ: ${error}`);
      this.logger.error(
        `Connection URL (masked): ${this.rabbitmqConfig.urls[0].replace(/:[^:@]+@/, ':****@')}`,
      );
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
          await this.setupConsumer();
        } catch (error) {
          this.logger.error(`Reconnection failed, will retry: ${error}`);
        }
      }
    }, 5000);
  }

  private async setupConsumer(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      this.queueName,
      async (msg) => {
        if (!msg) {
          return;
        }

        try {
          const data = JSON.parse(msg.content.toString()) as Context['update']['message'];

          // Get retry count from message headers (x-retry-count)
          const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

          await this.messageHandler.handleMessage(data).catch((error: unknown) => {
            this.logger.error('[ERROR] Error handling message:', error);
            this.handleMessageError(msg, retryCount, error);
            return;
          });

          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing message: ${error}`);
          const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
          this.handleMessageError(msg, retryCount, error);
        }
      },
      {
        noAck: false, // Manual acknowledgment
      },
    );

    this.logger.log(`Consumer set up for queue: ${this.queueName}`);
  }

  /**
   * Calculates exponential backoff delay based on retry attempt
   * Formula: baseDelay * 2^(retryCount) with a max cap
   */
  private calculateDelayMs(retryCount: number): number {
    const exponentialDelay = this.baseDelayMs * 2 ** retryCount;
    const maxDelayMs = 30000; // Cap at 30 seconds
    return Math.min(exponentialDelay, maxDelayMs);
  }

  /**
   * Handles message processing errors with retry logic and exponential backoff
   * Prevents infinite loops by tracking retry count
   */
  private handleMessageError(msg: ConsumeMessage, retryCount: number, error: unknown): void {
    if (retryCount >= this.maxRetries) {
      this.logger.error(
        `[ERROR] Message exceeded max retries (${this.maxRetries}). Discarding message to prevent infinite loop.`,
        error,
      );
      // Acknowledge to remove from queue (or send to DLQ if configured)
      this.channel?.ack(msg);
      return;
    }

    // Increment retry count
    const newRetryCount = retryCount + 1;
    const delayMs = this.calculateDelayMs(retryCount);

    this.logger.warn(
      `[WARN] Message processing failed (attempt ${newRetryCount}/${this.maxRetries}). Will requeue after ${delayMs}ms delay...`,
    );

    // Republish message with updated retry count header after delay
    // This is necessary because RabbitMQ doesn't allow modifying headers on nack
    if (this.channel) {
      setTimeout(() => {
        if (!this.channel) {
          this.logger.error('[ERROR] Channel not available when trying to republish message');
          return;
        }

        const headers = {
          ...(msg.properties.headers || {}),
          'x-retry-count': newRetryCount,
        };

        this.channel.sendToQueue(this.queueName, msg.content, {
          persistent: true,
          headers,
        });

        this.logger.log(
          `[DEBUG] Republished message after ${delayMs}ms delay (attempt ${newRetryCount})`,
        );
      }, delayMs);

      // Acknowledge the original message to remove it from queue
      this.channel.ack(msg);
    }
  }

  /**
   * Enqueues a message for processing
   */
  async enqueue(item: Context['update']['message']): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);
      const message = Buffer.from(JSON.stringify(item));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: true,
        headers: {
          'x-retry-count': 0, // Initialize retry count
        },
      });
    } catch (error) {
      this.logger.error(`[ERROR] Error enqueueing message: ${error}`);
      throw error;
    }
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
