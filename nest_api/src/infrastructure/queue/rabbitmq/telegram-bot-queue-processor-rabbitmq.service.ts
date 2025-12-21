import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
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
          const data = JSON.parse(msg.content.toString()) as Context['update']['message'];
          await this.messageHandler.handleMessage(data).catch((error: unknown) => {
            this.logger.error('[ERROR] Error handling message:', error);
            // Reject message and requeue on error
            this.channel?.nack(msg, false, true);
            return;
          });
          
          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing message: ${error}`);
          // Reject message and requeue on error
          this.channel?.nack(msg, false, true);
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

