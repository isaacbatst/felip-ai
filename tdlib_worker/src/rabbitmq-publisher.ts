import { connect, ChannelModel, Channel } from 'amqplib';

export interface RabbitMQConnection {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

// Reconnection configuration
const INITIAL_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

/**
 * Helper class for publishing messages to RabbitMQ with automatic reconnection
 */
export class RabbitMQPublisher {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly queueName: string;
  private readonly rabbitmqConfig: RabbitMQConnection;
  
  // Reconnection state
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private isClosing = false;

  constructor(rabbitmqConnection: RabbitMQConnection, queueName: string) {
    this.rabbitmqConfig = rabbitmqConnection;
    this.queueName = queueName;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[DEBUG] RabbitMQPublisher: Already connecting, skipping...');
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
      
      console.log(`[DEBUG] RabbitMQPublisher: Connecting to ${urlMasked}...`);
      
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();
      
      // Set up event listeners for connection
      this.connection.on('error', (err) => {
        console.error(`[ERROR] RabbitMQPublisher: Connection error: ${err.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] RabbitMQPublisher: Connection closed unexpectedly');
          this.handleConnectionError();
        }
      });

      // Set up event listeners for channel
      this.channel.on('error', (err) => {
        console.error(`[ERROR] RabbitMQPublisher: Channel error: ${err.message}`);
        this.handleConnectionError();
      });

      this.channel.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] RabbitMQPublisher: Channel closed unexpectedly');
          this.handleConnectionError();
        }
      });
      
      // Assert queue exists
      await this.channel.assertQueue(this.queueName, {
        durable: true,
      });
      
      console.log(`[DEBUG] ✅ RabbitMQPublisher: Connected to queue ${this.queueName}`);
      
      // Reset reconnect delay on successful connection
      this.currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error(`[ERROR] RabbitMQPublisher: Failed to connect: ${error}`);
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

    console.log(`[DEBUG] RabbitMQPublisher: Scheduling reconnection in ${this.currentReconnectDelay / 1000}s...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      
      if (this.isClosing) {
        return;
      }
      
      if (!this.connection || !this.channel) {
        try {
          await this.connect();
        } catch (error) {
          console.error(`[ERROR] RabbitMQPublisher: Reconnection failed: ${error}`);
          // Increase delay with exponential backoff
          this.currentReconnectDelay = Math.min(
            this.currentReconnectDelay * RECONNECT_BACKOFF_MULTIPLIER,
            MAX_RECONNECT_DELAY_MS
          );
        }
      }
    }, this.currentReconnectDelay);
  }

  async publish(pattern: string, data: unknown): Promise<void> {
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
      console.error(`[ERROR] RabbitMQPublisher: Error publishing to queue ${this.queueName}: ${error}`);
      
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
            console.log(`[DEBUG] RabbitMQPublisher: Retry successful for pattern ${pattern}`);
            return;
          } catch (retryError) {
            console.error(`[ERROR] RabbitMQPublisher: Retry failed: ${retryError}`);
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
      console.log('[DEBUG] RabbitMQPublisher: Closed successfully');
    } catch (error) {
      console.error('[ERROR] RabbitMQPublisher: Error closing:', error);
    }
  }
}
