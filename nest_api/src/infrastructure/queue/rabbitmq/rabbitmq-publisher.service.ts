import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';

/**
 * Service for publishing messages to RabbitMQ queues
 * Single Responsibility: publishing messages to RabbitMQ
 */
@Injectable()
export class RabbitMQPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQPublisherService.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly rabbitmqConfig: {
    urls: string[];
    queueOptions: {
      durable: boolean;
    };
  };

  constructor(private readonly configService: ConfigService) {
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
      this.logger.log('Connected to RabbitMQ for publishing');
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error}`);
      this.logger.error(`Connection URL (masked): ${this.rabbitmqConfig.urls[0].replace(/:[^:@]+@/, ':****@')}`);
      throw error;
    }
  }

  /**
   * Publishes a message to a queue
   */
  async publishToQueue<T>(queueName: string, data: T): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      await this.channel.assertQueue(queueName, this.rabbitmqConfig.queueOptions);
      const message = Buffer.from(JSON.stringify(data));
      this.channel.sendToQueue(queueName, message, {
        persistent: true,
      });
    } catch (error) {
      this.logger.error(`[ERROR] Error publishing to queue ${queueName}: ${error}`);
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

