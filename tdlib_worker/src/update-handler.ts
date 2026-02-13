import { Channel } from 'amqplib';
import { TelegramUserClient } from './telegram-user-client';
import { SharedRabbitMQConnection } from './shared-rabbitmq-connection';

/**
 * Handler responsável por receber eventos do Telegram Client e enviar para a fila RabbitMQ
 * Uses a shared connection and manages its own channel.
 */
export class UpdateHandler {
  private channel: Channel | null = null;
  private readonly queueName: string;
  private readonly userId?: string;
  private isClosing = false;

  constructor(
    private readonly client: TelegramUserClient,
    private readonly sharedConnection: SharedRabbitMQConnection,
    queueName: string = 'tdlib-updates',
    userId?: string,
  ) {
    this.queueName = queueName;
    this.userId = userId;

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
      throw new Error('UpdateHandler: Shared connection not available');
    }

    this.channel = await conn.createChannel();

    this.channel.on('error', (err) => {
      console.error(`[ERROR] UpdateHandler: Channel error: ${err.message}`);
      this.channel = null;
    });

    this.channel.on('close', () => {
      if (!this.isClosing) {
        console.warn('[WARN] UpdateHandler: Channel closed unexpectedly');
        this.channel = null;
      }
    });

    // Delete old queue to recreate with new arguments (TTL, max-length)
    try { await this.channel.deleteQueue(this.queueName); } catch {}

    await this.channel.assertQueue(this.queueName, {
      durable: true,
      arguments: {
        'x-message-ttl': 60000,
        'x-max-length': 1000,
        'x-overflow': 'drop-head',
      },
    });
    console.log(`[DEBUG] ✅ UpdateHandler: Channel ready for queue: ${this.queueName}`);
  }

  /**
   * Configura handlers para mensagens recebidas e envia para a fila RabbitMQ
   */
  setupHandlers(): void {
    this.client.onUpdate((update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateNewMessage') {
          this.publish('new-message', { update, userId: this.userId })
            .catch((error: unknown) => {
              console.error('[ERROR] UpdateHandler: Error enqueueing message to RabbitMQ:', error);
            });
        } else if (updateType === 'updateAuthorizationState') {
          this.publish('authorization-state', { update, userId: this.userId })
            .catch((error: unknown) => {
              console.error('[ERROR] UpdateHandler: Error enqueueing authorization state update:', error);
            });
        }
      }
    });
  }

  private async publish(pattern: string, data: unknown): Promise<void> {
    if (!this.channel) {
      // Try to re-create channel if connection is available
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
      console.error(`[ERROR] UpdateHandler: Error publishing to queue ${this.queueName}: ${error}`);

      // Try to re-create channel and retry once
      this.channel = null;
      const conn = this.sharedConnection.getConnection();
      if (conn) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          await this.setupChannel();
          const message = Buffer.from(JSON.stringify({ pattern, data }));
          this.channel!.sendToQueue(this.queueName, message, { persistent: false });
          console.log(`[DEBUG] UpdateHandler: Retry successful for pattern ${pattern}`);
          return;
        } catch (retryError) {
          console.error(`[ERROR] UpdateHandler: Retry failed: ${retryError}`);
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
      console.log('[DEBUG] UpdateHandler: Closed successfully');
    } catch (error) {
      console.error('[ERROR] UpdateHandler: Error closing:', error);
    }
  }
}
