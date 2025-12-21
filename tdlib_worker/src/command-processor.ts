import { connect, ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { TelegramUserClient } from './telegram-user-client';
import { LoginSessionManager } from './login-session-manager';
import type { CommandContext, TdlibCommand } from '@felip-ai/shared-types';
import { RabbitMQPublisher, type RabbitMQConnection } from './rabbitmq-publisher';

// Re-export for convenience
export type { CommandContext, TdlibCommand };

/**
 * Processor responsável por processar comandos recebidos via RabbitMQ
 */
export class CommandProcessor {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private updatesPublisher: RabbitMQPublisher;
  private loginSessionManager: LoginSessionManager;
  private readonly queueName: string;
  private readonly rabbitmqConfig: RabbitMQConnection;

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
      
      console.log(`[DEBUG] ✅ Connected to RabbitMQ and asserted queue: ${this.queueName}`);
    } catch (error) {
      console.error(`[ERROR] Failed to connect to RabbitMQ: ${error}`);
      throw error;
    }
  }

  private async setupConsumer(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
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

          console.log(`[DEBUG] ✅ Command received: ${pattern} (requestId: ${command.requestId})`);

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
            console.error(`[ERROR] ❌ Command failed: ${pattern} (requestId: ${command.requestId})`, error);
            
            // Send error response back to nest_api via updates queue
            if (command.requestId) {
              await this.updatesPublisher.publish('command-response', {
                requestId: command.requestId,
                commandType: command.type,
                error: error instanceof Error ? error.message : String(error),
                context: command.context, // Echo back context from command
              });
            }
            
            // Reject message and requeue on error
            this.channel?.nack(msg, false, true);
          }
        } catch (error) {
          console.error(`[ERROR] Error processing message: ${error}`);
          // Reject message and requeue on error
          this.channel?.nack(msg, false, true);
        }
      },
      {
        noAck: false, // Manual acknowledgment
      },
    );

    console.log(`[DEBUG] ✅ Worker is now listening to queue: ${this.queueName}`);
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
          console.error(`[ERROR] Unknown command type: ${(command as TdlibCommand).type}`);
          throw new Error(`Unknown command type: ${(command as TdlibCommand).type}`);
      }
    } catch (error) {
      console.error(`[ERROR] Error processing command ${command.type}:`, error);
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
      await this.updatesPublisher.close();
      console.log('[DEBUG] CommandProcessor closed successfully');
    } catch (error) {
      console.error('[ERROR] Error closing CommandProcessor:', error);
    }
  }
}
