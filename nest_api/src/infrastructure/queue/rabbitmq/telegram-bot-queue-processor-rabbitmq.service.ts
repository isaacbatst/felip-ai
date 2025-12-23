import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
import { Context } from 'grammy';
import { TelegramBotMessageHandler } from '../../telegram/handlers/telegram-bot-message.handler';
import { MessageProcessedLogRepository } from '@/infrastructure/persistence/message-processed-log.repository';
import { MessageEnqueuedLogRepository } from '@/infrastructure/persistence/message-enqueued-log.repository';

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
  private readonly rabbitmqConfig: {
    urls: string[];
    queueOptions: {
      durable: boolean;
    };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly messageHandler: TelegramBotMessageHandler,
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

          await this.messageHandler.handleMessage(data).catch(async (error: unknown) => {
            this.logger.error('[ERROR] Error handling message:', error);
            
            // Log failed processing
            await this.messageProcessedLogRepository.logProcessedMessage({
              queueName: this.queueName,
              messageData: data,
              userId: data?.from?.id?.toString(),
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
            }).catch((logError) => {
              this.logger.error(`[ERROR] Failed to log failed message: ${logError}`);
            });
            
            // Acknowledge message to remove from queue (accept failure)
            this.channel?.ack(msg);
            return;
          });

          // Log successful processing
          await this.messageProcessedLogRepository.logProcessedMessage({
            queueName: this.queueName,
            messageData: data,
            userId: data?.from?.id?.toString(),
            status: 'success',
          }).catch((logError) => {
            this.logger.error(`[ERROR] Failed to log processed message: ${logError}`);
          });

          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing message: ${error}`);
          
          // Log failed processing
          try {
            const data = JSON.parse(msg.content.toString()) as Context['update']['message'];
            await this.messageProcessedLogRepository.logProcessedMessage({
              queueName: this.queueName,
              messageData: data,
              userId: data?.from?.id?.toString(),
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
            }).catch((logError) => {
              this.logger.error(`[ERROR] Failed to log failed message: ${logError}`);
            });
          } catch (parseError) {
            this.logger.error(`[ERROR] Failed to parse message for logging: ${parseError}`);
          }
          
          // Acknowledge message to remove from queue (accept failure)
          this.channel?.ack(msg);
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
  async enqueue(item: Context['update']['message']): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);
      const message = Buffer.from(JSON.stringify(item));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: true,
      });

      // Log enqueued message
      await this.messageEnqueuedLogRepository.logEnqueuedMessage({
        queueName: this.queueName,
        messageData: item,
        userId: item?.from?.id?.toString(),
      }).catch((logError) => {
        this.logger.error(`[ERROR] Failed to log enqueued message: ${logError}`);
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
