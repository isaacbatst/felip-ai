import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel, ConsumeMessage } from 'amqplib';
import { QueuedMessage } from '../../telegram/interfaces/queued-message';
import { TelegramUserMessageProcessor } from '../../telegram/telegram-user-message-processor';
import { MessageProcessedLogRepository } from '@/infrastructure/persistence/message-processed-log.repository';
import { MessageEnqueuedLogRepository } from '@/infrastructure/persistence/message-enqueued-log.repository';

/**
 * RabbitMQ-based queue processor for Telegram user messages
 * Single Responsibility: processing Telegram user messages via RabbitMQ
 */
@Injectable()
export class TelegramUserQueueProcessorRabbitMQ implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUserQueueProcessorRabbitMQ.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly queueName = 'telegram-user-messages';
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
    private readonly messageProcessor: TelegramUserMessageProcessor,
    private readonly messageProcessedLogRepository: MessageProcessedLogRepository,
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
    await this.setupConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const connectionUrl = this.rabbitmqConfig.urls[0];
      // Log connection URL without password for debugging
      const urlWithoutPassword = connectionUrl.replace(/:[^:@]+@/, ':****@');
      this.logger.log(`Attempting to connect to RabbitMQ: ${urlWithoutPassword}`);
      
      this.connection = await connect(connectionUrl);
      this.channel = await this.connection.createChannel();
      
      // Assert queue exists
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);
      
      this.logger.log(`Connected to RabbitMQ and asserted queue: ${this.queueName}`);
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error}`);
      this.logger.error(`Connection URL (masked): ${this.rabbitmqConfig.urls[0].replace(/:[^:@]+@/, ':****@')}`);
      throw error;
    }
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
          const message = JSON.parse(msg.content.toString()) as QueuedMessage;
          const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;

          await this.messageProcessor.processMessage(message);

          // Log successful processing
          await this.messageProcessedLogRepository.logProcessedMessage({
            queueName: this.queueName,
            messageData: message,
            userId: message.userId,
            status: 'success',
            retryCount,
          }).catch((logError) => {
            this.logger.error(`[ERROR] Failed to log processed message: ${logError}`);
          });

          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing message: ${error}`);
          const retryCount = (msg.properties.headers?.['x-retry-count'] as number) || 0;
          
          // Log failed processing
          try {
            const message = JSON.parse(msg.content.toString()) as QueuedMessage;
            await this.messageProcessedLogRepository.logProcessedMessage({
              queueName: this.queueName,
              messageData: message,
              userId: message.userId,
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              retryCount,
            }).catch((logError) => {
              this.logger.error(`[ERROR] Failed to log failed message: ${logError}`);
            });
          } catch (parseError) {
            this.logger.error(`[ERROR] Failed to parse message for logging: ${parseError}`);
          }
          
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
   * Enqueues a message for processing
   */
  async enqueue(item: QueuedMessage): Promise<void> {
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

      // Log enqueued message
      await this.messageEnqueuedLogRepository.logEnqueuedMessage({
        queueName: this.queueName,
        messageData: item,
        userId: item.userId,
      }).catch((logError) => {
        this.logger.error(`[ERROR] Failed to log enqueued message: ${logError}`);
      });
    } catch (error) {
      this.logger.error(`[ERROR] Error enqueueing message: ${error}`);
      throw error;
    }
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

