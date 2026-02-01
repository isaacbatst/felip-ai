import { connect, ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { TelegramUserClient } from './telegram-user-client';
import { LoginSessionManager } from './login-session-manager';
import type { CommandContext, TdlibCommand } from '@felip-ai/shared-types';
import { RabbitMQPublisher, type RabbitMQConnection } from './rabbitmq-publisher';

// Re-export for convenience
export type { CommandContext, TdlibCommand };

// Reconnection configuration
const INITIAL_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;

/**
 * Processor responsável por processar comandos recebidos via RabbitMQ
 * with automatic reconnection and consumer re-establishment
 */
export class CommandProcessor {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private updatesPublisher: RabbitMQPublisher;
  private loginSessionManager: LoginSessionManager;
  private readonly queueName: string;
  private readonly rabbitmqConfig: RabbitMQConnection;

  // Reconnection state
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private isClosing = false;
  private isConsumerActive = false;
  private consumerTag: string | null = null;

  constructor(
    private readonly client: TelegramUserClient,
    rabbitmqConnection: RabbitMQConnection,
    queueName: string = 'tdlib-commands',
    updatesQueueName: string = 'tdlib-updates',
    loggedInUserId?: string,
  ) {
    this.queueName = queueName;
    this.rabbitmqConfig = rabbitmqConnection;
    
    console.log(`[DEBUG] CommandProcessor: Listening to commands queue: ${queueName}`);
    console.log(`[DEBUG] CommandProcessor: Using updates queue: ${updatesQueueName}`);
    if (loggedInUserId) {
      console.log(`[DEBUG] CommandProcessor: Logged in user ID: ${loggedInUserId}`);
    }

    // Initialize updates publisher
    this.updatesPublisher = new RabbitMQPublisher(rabbitmqConnection, updatesQueueName);

    this.loginSessionManager = new LoginSessionManager(
      client,
      this.updatesPublisher,
      loggedInUserId,
    );
  }

  async start(): Promise<void> {
    await this.connect();
    await this.setupConsumer();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) {
      console.log('[DEBUG] CommandProcessor: Already connecting, skipping...');
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
      
      console.log(`[DEBUG] CommandProcessor: Connecting to ${urlMasked}...`);
      
      this.connection = await connect(url);
      this.channel = await this.connection.createChannel();
      
      // Set up event listeners for connection
      this.connection.on('error', (err) => {
        console.error(`[ERROR] CommandProcessor: Connection error: ${err.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] CommandProcessor: Connection closed unexpectedly');
          this.handleConnectionError();
        }
      });

      // Set up event listeners for channel
      this.channel.on('error', (err) => {
        console.error(`[ERROR] CommandProcessor: Channel error: ${err.message}`);
        this.handleConnectionError();
      });

      this.channel.on('close', () => {
        if (!this.isClosing) {
          console.warn('[WARN] CommandProcessor: Channel closed unexpectedly');
          this.handleConnectionError();
        }
      });
      
      // Assert queue exists
      await this.channel.assertQueue(this.queueName, {
        durable: true,
      });
      
      console.log(`[DEBUG] ✅ CommandProcessor: Connected to RabbitMQ and asserted queue: ${this.queueName}`);
      
      // Reset reconnect delay on successful connection
      this.currentReconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      console.error(`[ERROR] CommandProcessor: Failed to connect to RabbitMQ: ${error}`);
      this.scheduleReconnect();
      throw error;
    }
  }

  private handleConnectionError(): void {
    // Clear existing connection state
    this.channel = null;
    this.connection = null;
    this.isConsumerActive = false;
    this.consumerTag = null;
    
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

    console.log(`[DEBUG] CommandProcessor: Scheduling reconnection in ${this.currentReconnectDelay / 1000}s...`);
    
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      
      if (this.isClosing) {
        return;
      }
      
      if (!this.connection || !this.channel) {
        try {
          await this.reconnect();
        } catch (error) {
          console.error(`[ERROR] CommandProcessor: Reconnection failed: ${error}`);
          // Increase delay with exponential backoff
          this.currentReconnectDelay = Math.min(
            this.currentReconnectDelay * RECONNECT_BACKOFF_MULTIPLIER,
            MAX_RECONNECT_DELAY_MS
          );
        }
      }
    }, this.currentReconnectDelay);
  }

  private async reconnect(): Promise<void> {
    console.log('[DEBUG] CommandProcessor: Attempting reconnection...');
    await this.connect();
    await this.setupConsumer();
    console.log('[DEBUG] ✅ CommandProcessor: Reconnection successful, consumer re-established');
  }

  private async setupConsumer(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    if (this.isConsumerActive) {
      console.log('[DEBUG] CommandProcessor: Consumer already active, skipping setup');
      return;
    }

    const { consumerTag } = await this.channel.consume(
      this.queueName,
      async (msg: ConsumeMessage | null) => {
        if (!msg) {
          return;
        }

        try {
          // Parse message - nest_api sends { pattern, data }
          const message = JSON.parse(msg.content.toString()) as {
            pattern: string;
            data: TdlibCommand;
          };
          
          const command = message.data;
          const pattern = message.pattern || command.type;

          console.log(`[DEBUG] ✅ CommandProcessor: Command received: ${pattern} (requestId: ${command.requestId})`);

          try {
            const result = await this.processCommand(command);
            
            // Send response back to nest_api via updates queue
            if (command.requestId) {
              await this.updatesPublisher.publish('command-response', {
                requestId: command.requestId,
                commandType: command.type,
                result,
                context: command.context, // Echo back context from command
              });
            }
            
            // Acknowledge message after successful processing
            this.channel?.ack(msg);
          } catch (error) {
            console.error(`[ERROR] ❌ CommandProcessor: Command failed: ${pattern} (requestId: ${command.requestId})`, error);
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Send error response back to nest_api via updates queue
            if (command.requestId) {
              await this.updatesPublisher.publish('command-response', {
                requestId: command.requestId,
                commandType: command.type,
                error: errorMessage,
                context: command.context, // Echo back context from command
              });
            }
            
            // Acknowledge message to remove from queue (accept failure)
            console.log(`[DEBUG] CommandProcessor: Command failed - acknowledging message (accept failure): ${errorMessage}`);
            this.channel?.ack(msg);
          }
        } catch (error) {
          console.error(`[ERROR] CommandProcessor: Error processing message: ${error}`);
          // Acknowledge message to remove from queue (accept failure)
          this.channel?.ack(msg);
        }
      },
      {
        noAck: false, // Manual acknowledgment
      },
    );

    this.consumerTag = consumerTag;
    this.isConsumerActive = true;
    console.log(`[DEBUG] ✅ CommandProcessor: Worker is now listening to queue: ${this.queueName} (consumerTag: ${consumerTag})`);
  }

  private async processCommand(command: TdlibCommand): Promise<unknown> {
    try {
      switch (command.type) {
        case 'sendMessage': {
          const { chatId, text, replyToMessageId } = command.payload as {
            chatId: number;
            text: string;
            replyToMessageId?: number;
          };
          return await this.client.sendMessage(chatId, text, replyToMessageId);
        }
        case 'login': {
          const { phoneNumber } = command.payload as {
            phoneNumber: string;
          };
          if (!command.requestId) {
            throw new Error('Login command requires requestId');
          }
          await this.loginSessionManager.startLogin(
            phoneNumber,
          );
          return {
            phoneNumber,
          };
        }
        case 'provideAuthCode': {
          const { requestId, code, userId, chatId, phoneNumber, state } = command.payload as {
            requestId: string;
            code: string;
            userId: number;
            chatId: number;
            phoneNumber: string;
            state: string;
          };
          const provided = await this.loginSessionManager.provideAuthCode(requestId, code, {
            userId,
            chatId,
            phoneNumber,
            state,
          });
          if (!provided) {
            throw new Error(`Failed to provide auth code for requestId: ${requestId}`);
          }
          return { success: true };
        }
        case 'providePassword': {
          const { requestId, password, userId, chatId, phoneNumber, state } = command.payload as {
            requestId: string;
            password: string;
            userId: number;
            chatId: number;
            phoneNumber: string;
            state: string;
          };
          const provided = await this.loginSessionManager.providePassword(requestId, password, {
            userId,
            chatId,
            phoneNumber,
            state,
          });
          if (!provided) {
            throw new Error(`Failed to provide password for requestId: ${requestId}`);
          }
          return { success: true };
        }
        case 'getChats': {
          const { chatList, limit } = command.payload as {
            chatList: { _: string };
            limit: number;
          };
          return await this.client.getChats(chatList, limit);
        }
        case 'getChat': {
          const { chatId } = command.payload as { chatId: number };
          return await this.client.getChat(chatId);
        }
        case 'getAuthorizationState': {
          return await this.client.getAuthorizationState();
        }
        case 'logOut': {
          return await this.client.logOut();
        }
        case 'getMe': {
          return await this.client.getMe();
        }
        case 'getUserId': {
          return await this.client.getUserId();
        }
        case 'resendAuthenticationCode': {
          return await this.client.resendAuthenticationCode();
        }
        default:
          throw new Error(`Unknown command type command-processor: ${(command as TdlibCommand).type}`);
      }
    } catch (error) {
      console.error(`[ERROR] CommandProcessor: Error processing command ${command.type}:`, error);
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
      // Cancel consumer if active
      if (this.channel && this.consumerTag) {
        try {
          await this.channel.cancel(this.consumerTag);
          console.log(`[DEBUG] CommandProcessor: Consumer cancelled (tag: ${this.consumerTag})`);
        } catch (cancelError) {
          console.error('[ERROR] CommandProcessor: Error cancelling consumer:', cancelError);
        }
      }
      
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      await this.updatesPublisher.close();
      
      this.isConsumerActive = false;
      this.consumerTag = null;
      
      console.log('[DEBUG] CommandProcessor: Closed successfully');
    } catch (error) {
      console.error('[ERROR] CommandProcessor: Error closing:', error);
    }
  }
}
