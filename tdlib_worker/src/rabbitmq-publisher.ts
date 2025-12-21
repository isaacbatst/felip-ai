import { connect, ChannelModel, Channel } from 'amqplib';

export interface RabbitMQConnection {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

/**
 * Helper class for publishing messages to RabbitMQ
 */
export class RabbitMQPublisher {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly queueName: string;
  private readonly rabbitmqConfig: RabbitMQConnection;

  constructor(rabbitmqConnection: RabbitMQConnection, queueName: string) {
    this.rabbitmqConfig = rabbitmqConnection;
    this.queueName = queueName;
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return; // Already connected
    }

    try {
      const user = this.rabbitmqConfig.user || 'guest';
      const password = this.rabbitmqConfig.password || 'guest';
      const url = `amqp://${user}:${password}@${this.rabbitmqConfig.host}:${this.rabbitmqConfig.port}`;
      
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();
      
      // Assert queue exists
      await this.channel.assertQueue(this.queueName, {
        durable: true,
      });
    } catch (error) {
      console.error(`[ERROR] Failed to connect RabbitMQ publisher: ${error}`);
      throw error;
    }
  }

  async publish(pattern: string, data: unknown): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    try {
      await this.channel.assertQueue(this.queueName, {
        durable: true,
      });
      
      // nest_api expects format: { pattern, data }
      const message = Buffer.from(JSON.stringify({ pattern, data }));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: true,
      });
    } catch (error) {
      console.error(`[ERROR] Error publishing to queue ${this.queueName}: ${error}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      console.error('[ERROR] Error closing RabbitMQ publisher:', error);
    }
  }
}

