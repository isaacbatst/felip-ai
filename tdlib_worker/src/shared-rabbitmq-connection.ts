import { connect, ChannelModel } from 'amqplib';

export interface RabbitMQConnectionConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
}

const INITIAL_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

/**
 * Shared RabbitMQ connection that manages a single TCP connection
 * with automatic reconnection. Components register onReconnect callbacks
 * to re-create their channels after a reconnection.
 */
export class SharedRabbitMQConnection {
  private connection: ChannelModel | null = null;
  private readonly config: RabbitMQConnectionConfig;
  private readonly reconnectCallbacks: Array<() => Promise<void>> = [];

  // Reconnection state
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private isClosing = false;

  constructor(config: RabbitMQConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[DEBUG] SharedRabbitMQConnection: Already connecting, skipping...');
      return;
    }

    if (this.connection) {
      return;
    }

    this.isConnecting = true;

    try {
      const user = this.config.user || 'guest';
      const password = this.config.password || 'guest';
      const url = `amqp://${user}:${password}@${this.config.host}:${this.config.port}`;
      const urlMasked = `amqp://${user}:****@${this.config.host}:${this.config.port}`;

      console.log(`[DEBUG] SharedRabbitMQConnection: Connecting to ${urlMasked}...`);

      this.connection = await connect(url);

      this.connection.on('error', (err) => {
        console.error(`[ERROR] SharedRabbitMQConnection: Connection error: ${err.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] SharedRabbitMQConnection: Connection closed unexpectedly');
          this.handleConnectionError();
        }
      });

      console.log('[DEBUG] SharedRabbitMQConnection: Connected to RabbitMQ');

      this.currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error(`[ERROR] SharedRabbitMQConnection: Failed to connect: ${error}`);
      this.scheduleReconnect();
      throw error;
    }
  }

  getConnection(): ChannelModel | null {
    return this.connection;
  }

  onReconnect(callback: () => Promise<void>): void {
    this.reconnectCallbacks.push(callback);
  }

  private handleConnectionError(): void {
    this.connection = null;

    if (!this.isClosing) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    if (this.isClosing) {
      return;
    }

    console.log(`[DEBUG] SharedRabbitMQConnection: Scheduling reconnection in ${this.currentReconnectDelay / 1000}s...`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      if (this.isClosing) {
        return;
      }

      if (!this.connection) {
        try {
          await this.connect();
          await this.notifyReconnectCallbacks();
        } catch (error) {
          console.error(`[ERROR] SharedRabbitMQConnection: Reconnection failed: ${error}`);
          this.currentReconnectDelay = Math.min(
            this.currentReconnectDelay * RECONNECT_BACKOFF_MULTIPLIER,
            MAX_RECONNECT_DELAY_MS,
          );
        }
      }
    }, this.currentReconnectDelay);
  }

  private async notifyReconnectCallbacks(): Promise<void> {
    for (const callback of this.reconnectCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.error(`[ERROR] SharedRabbitMQConnection: Reconnect callback failed: ${error}`);
      }
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('[DEBUG] SharedRabbitMQConnection: Closed successfully');
    } catch (error) {
      console.error('[ERROR] SharedRabbitMQConnection: Error closing:', error);
    }
  }
}
