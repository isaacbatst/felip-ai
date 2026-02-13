import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
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
      await this.channel.prefetch(10);

      await this.channel.assertQueue(this.queueName, {
        ...this.rabbitmqConfig.queueOptions,
        arguments: {
          'x-message-ttl': 60000,
          'x-max-length': 1000,
          'x-overflow': 'drop-head',
        },
      });
      
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

          await this.messageProcessor.processMessage(message);

          // Log successful processing
          await this.messageProcessedLogRepository.logProcessedMessage({
            queueName: this.queueName,
            messageData: message,
            userId: message.userId,
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
            const message = JSON.parse(msg.content.toString()) as QueuedMessage;
            await this.messageProcessedLogRepository.logProcessedMessage({
              queueName: this.queueName,
              messageData: message,
              userId: message.userId,
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
  async enqueue(item: QueuedMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      const message = Buffer.from(JSON.stringify(item));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: false,
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

