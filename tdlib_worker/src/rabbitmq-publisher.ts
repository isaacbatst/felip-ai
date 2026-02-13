import { Channel } from 'amqplib';
import { SharedRabbitMQConnection } from './shared-rabbitmq-connection';

// Re-export for backwards compatibility with imports
export type { RabbitMQConnectionConfig as RabbitMQConnection } from './shared-rabbitmq-connection';

/**
 * Helper class for publishing messages to RabbitMQ with channel management.
 * Uses a shared connection.
 */
export class RabbitMQPublisher {
  private channel: Channel | null = null;
  private readonly queueName: string;
  private isClosing = false;

  constructor(
    private readonly sharedConnection: SharedRabbitMQConnection,
    queueName: string,
  ) {
    this.queueName = queueName;

    this.sharedConnection.onReconnect(async () => {
      if (!this.isClosing) {
        await this.setupChannel();
      }
    });
  }

  async connect(): Promise<void> {
    await this.setupChannel();
  }

  private async setupChannel(): Promise<void> {
    const conn = this.sharedConnection.getConnection();
    if (!conn) {
      throw new Error('RabbitMQPublisher: Shared connection not available');
    }

    this.channel = await conn.createChannel();

    this.channel.on('error', (err) => {
      console.error(`[ERROR] RabbitMQPublisher: Channel error: ${err.message}`);
      this.channel = null;
    });

    this.channel.on('close', () => {
      if (!this.isClosing) {
        console.warn('[WARN] RabbitMQPublisher: Channel closed unexpectedly');
        this.channel = null;
      }
    });

    await this.channel.assertQueue(this.queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': 60000,
        'x-max-length': 1000,
        'x-overflow': 'drop-head',
      },
    });
    console.log(`[DEBUG] ✅ RabbitMQPublisher: Channel ready for queue ${this.queueName}`);
  }

  async publish(pattern: string, data: unknown): Promise<void> {
    if (!this.channel) {
      const conn = this.sharedConnection.getConnection();
      if (conn) {
        await this.setupChannel();
      }
    }

    if (!this.channel) {
      throw new Error('Channel not initialized. RabbitMQ may be unavailable.');
    }

    try {
      const message = Buffer.from(JSON.stringify({ pattern, data }));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: false,
      });
    } catch (error) {
      console.error(`[ERROR] RabbitMQPublisher: Error publishing to queue ${this.queueName}: ${error}`);

      this.channel = null;
      const conn = this.sharedConnection.getConnection();
      if (conn) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          await this.setupChannel();
          const message = Buffer.from(JSON.stringify({ pattern, data }));
          this.channel!.sendToQueue(this.queueName, message, { persistent: false });
          console.log(`[DEBUG] RabbitMQPublisher: Retry successful for pattern ${pattern}`);
          return;
        } catch (retryError) {
          console.error(`[ERROR] RabbitMQPublisher: Retry failed: ${retryError}`);
        }
      }

      throw error;
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      console.log('[DEBUG] RabbitMQPublisher: Closed successfully');
    } catch (error) {
      console.error('[ERROR] RabbitMQPublisher: Error closing:', error);
    }
  }
}
