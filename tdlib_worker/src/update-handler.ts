import { connect, ChannelModel, Channel } from 'amqplib';
import { TelegramUserClient } from './telegram-user-client';
import type { RabbitMQConnection } from './rabbitmq-publisher';

// Reconnection configuration
const INITIAL_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

/**
 * Handler responsável por receber eventos do Telegram Client e enviar para a fila RabbitMQ
 * with automatic reconnection support
 */
export class UpdateHandler {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly queueName: string;
  private readonly userId?: string;
  private readonly rabbitmqConfig: RabbitMQConnection;

  // Reconnection state
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private isClosing = false;

  constructor(
    private readonly client: TelegramUserClient,
    rabbitmqConnection: RabbitMQConnection,
    queueName: string = 'tdlib-updates',
    userId?: string,
  ) {
    this.queueName = queueName;
    this.userId = userId;
    this.rabbitmqConfig = rabbitmqConnection;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[DEBUG] UpdateHandler: Already connecting, skipping...');
      return;
    }

    if (this.connection && this.channel) {
      return; // Already connected
    }

    this.isConnecting = true;

    try {
      const user = this.rabbitmqConfig.user || 'guest';
      const password = this.rabbitmqConfig.password || 'guest';
      const url = `amqp://${user}:${password}@${this.rabbitmqConfig.host}:${this.rabbitmqConfig.port}`;
      const urlMasked = `amqp://${user}:****@${this.rabbitmqConfig.host}:${this.rabbitmqConfig.port}`;
      
      console.log(`[DEBUG] UpdateHandler: Connecting to ${urlMasked}...`);
      
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();
      
      // Set up event listeners for connection
      this.connection.on('error', (err) => {
        console.error(`[ERROR] UpdateHandler: Connection error: ${err.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] UpdateHandler: Connection closed unexpectedly');
          this.handleConnectionError();
        }
      });

      // Set up event listeners for channel
      this.channel.on('error', (err) => {
        console.error(`[ERROR] UpdateHandler: Channel error: ${err.message}`);
        this.handleConnectionError();
      });

      this.channel.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] UpdateHandler: Channel closed unexpectedly');
          this.handleConnectionError();
        }
      });
      
      // Assert queue exists
      await this.channel.assertQueue(this.queueName, {
        durable: true,
      });
      
      console.log(`[DEBUG] ✅ UpdateHandler: Connected to RabbitMQ queue: ${this.queueName}`);
      
      // Reset reconnect delay on successful connection
      this.currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error(`[ERROR] UpdateHandler: Failed to connect to RabbitMQ: ${error}`);
      this.scheduleReconnect();
      throw error;
    }
  }

  private handleConnectionError(): void {
    // Clear existing connection state
    this.channel = null;
    this.connection = null;
    
    if (!this.isClosing) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    if (this.isClosing) {
      return; // Don't reconnect if we're closing
    }

    console.log(`[DEBUG] UpdateHandler: Scheduling reconnection in ${this.currentReconnectDelay / 1000}s...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      
      if (this.isClosing) {
        return;
      }
      
      if (!this.connection || !this.channel) {
        try {
          await this.connect();
        } catch (error) {
          console.error(`[ERROR] UpdateHandler: Reconnection failed: ${error}`);
          // Increase delay with exponential backoff
          this.currentReconnectDelay = Math.min(
            this.currentReconnectDelay * RECONNECT_BACKOFF_MULTIPLIER,
            MAX_RECONNECT_DELAY_MS
          );
        }
      }
    }, this.currentReconnectDelay);
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
          // Send authorization state updates
          this.publish('authorization-state', { update, userId: this.userId })
            .catch((error: unknown) => {
              console.error('[ERROR] UpdateHandler: Error enqueueing authorization state update:', error);
            });
        }
      }
    });
  }

  private async publish(pattern: string, data: unknown): Promise<void> {
    // Ensure connection is established
    if (!this.channel || !this.connection) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Channel not initialized. RabbitMQ may be unavailable.');
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
      console.error(`[ERROR] UpdateHandler: Error publishing to queue ${this.queueName}: ${error}`);
      
      // Try to reconnect and retry once
      if (!this.isConnecting) {
        this.handleConnectionError();
        
        // Wait a bit for reconnection
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (this.channel) {
          try {
            await this.channel.assertQueue(this.queueName, { durable: true });
            const message = Buffer.from(JSON.stringify({ pattern, data }));
            this.channel.sendToQueue(this.queueName, message, { persistent: true });
            console.log(`[DEBUG] UpdateHandler: Retry successful for pattern ${pattern}`);
            return;
          } catch (retryError) {
            console.error(`[ERROR] UpdateHandler: Retry failed: ${retryError}`);
          }
        }
      }
      
      throw error;
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;
    
    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('[DEBUG] UpdateHandler: Closed successfully');
    } catch (error) {
      console.error('[ERROR] UpdateHandler: Error closing:', error);
    }
  }
}
