import { Channel, ConsumeMessage } from 'amqplib';
import { TelegramUserClient } from './telegram-user-client';
import { LoginSessionManager } from './login-session-manager';
import type { CommandContext, TdlibCommand } from '@felip-ai/shared-types';
import { RabbitMQPublisher } from './rabbitmq-publisher';
import { SharedRabbitMQConnection } from './shared-rabbitmq-connection';

// Re-export for convenience
export type { CommandContext, TdlibCommand };

/**
 * Processor responsável por processar comandos recebidos via RabbitMQ
 * Uses a shared connection and manages its own channel + consumer.
 */
export class CommandProcessor {
  private channel: Channel | null = null;
  private updatesPublisher: RabbitMQPublisher;
  private loginSessionManager: LoginSessionManager;
  private readonly queueName: string;

  private isClosing = false;
  private isConsumerActive = false;
  private consumerTag: string | null = null;

  constructor(
    private readonly client: TelegramUserClient,
    private readonly sharedConnection: SharedRabbitMQConnection,
    queueName: string = 'tdlib-commands',
    updatesQueueName: string = 'tdlib-updates',
    loggedInUserId?: string,
  ) {
    this.queueName = queueName;

    console.log(`[DEBUG] CommandProcessor: Listening to commands queue: ${queueName}`);
    console.log(`[DEBUG] CommandProcessor: Using updates queue: ${updatesQueueName}`);
    if (loggedInUserId) {
      console.log(`[DEBUG] CommandProcessor: Logged in user ID: ${loggedInUserId}`);
    }

    this.updatesPublisher = new RabbitMQPublisher(sharedConnection, updatesQueueName);

    this.loginSessionManager = new LoginSessionManager(
      client,
      this.updatesPublisher,
      loggedInUserId,
    );

    this.sharedConnection.onReconnect(async () => {
      if (!this.isClosing) {
        await this.setupChannel();
        await this.setupConsumer();
        console.log('[DEBUG] ✅ CommandProcessor: Reconnected — channel and consumer re-established');
      }
    });
  }

  async start(): Promise<void> {
    await this.setupChannel();
    await this.updatesPublisher.connect();
    await this.setupConsumer();
  }

  private async setupChannel(): Promise<void> {
    const conn = this.sharedConnection.getConnection();
    if (!conn) {
      throw new Error('CommandProcessor: Shared connection not available');
    }

    this.channel = await conn.createChannel();
    await this.channel.prefetch(10);

    this.channel.on('error', (err) => {
      console.error(`[ERROR] CommandProcessor: Channel error: ${err.message}`);
      this.channel = null;
      this.isConsumerActive = false;
      this.consumerTag = null;
    });

    this.channel.on('close', () => {
      if (!this.isClosing) {
        console.warn('[WARN] CommandProcessor: Channel closed unexpectedly');
        this.channel = null;
        this.isConsumerActive = false;
        this.consumerTag = null;
      }
    });

    await this.channel.assertQueue(this.queueName, { durable: true });
    console.log(`[DEBUG] ✅ CommandProcessor: Channel ready for queue: ${this.queueName}`);
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
      await this.updatesPublisher.close();

      this.isConsumerActive = false;
      this.consumerTag = null;

      console.log('[DEBUG] CommandProcessor: Closed successfully');
    } catch (error) {
      console.error('[ERROR] CommandProcessor: Error closing:', error);
    }
  }
}
