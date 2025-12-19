import { Queue, Worker } from 'bullmq';
import { TelegramUserClient } from './telegram-user-client';
import { LoginSessionManager } from './login-session-manager';
import type { CommandContext, TdlibCommand } from '@felip-ai/shared-types';

// Re-export for convenience
export type { CommandContext, TdlibCommand };

/**
 * Processor responsável por processar comandos recebidos via BullMQ
 */
export class CommandProcessor {
  private worker: Worker;
  private updatesQueue: Queue;
  private loginSessionManager: LoginSessionManager;

  constructor(
    private readonly client: TelegramUserClient,
    redisConnection: { host: string; port: number; password?: string },
    queueName: string = 'tdlib-commands',
    updatesQueueName: string = 'tdlib-updates',
    loggedInUserId?: string,
  ) {
    console.log(`[DEBUG] CommandProcessor: Listening to commands queue: ${queueName}`);
    console.log(`[DEBUG] CommandProcessor: Using updates queue: ${updatesQueueName}`);
    if (loggedInUserId) {
      console.log(`[DEBUG] CommandProcessor: Logged in user ID: ${loggedInUserId}`);
    }

    this.updatesQueue = new Queue(updatesQueueName, {
      connection: redisConnection,
    });

    this.loginSessionManager = new LoginSessionManager(
      client,
      this.updatesQueue,
      loggedInUserId,
    );

    this.worker = new Worker(
      queueName,
      async (job) => {
        const result = await this.processCommand(job.data as TdlibCommand);
        return result;
      },
      {
        connection: redisConnection,
      },
    );

    this.worker.on('completed', async (job, result) => {
      console.log(`[DEBUG] ✅ Command processed: ${job.id} (type: ${(job.data as TdlibCommand).type})`);
      const command = job.data as TdlibCommand;
      if (command.requestId) {
        // Send response back to nest_api via updates queue, including context if present
        await this.updatesQueue.add('command-response', {
          requestId: command.requestId,
          commandType: command.type,
          result,
          context: command.context, // Echo back context from command
        });
      }
    });

    this.worker.on('failed', async (job, err) => {
      console.error(`[ERROR] ❌ Command failed: ${job?.id} (type: ${(job?.data as TdlibCommand)?.type})`, err);
      const command = job?.data as TdlibCommand;
      if (command?.requestId) {
        // Send error response back to nest_api via updates queue, including context if present
        await this.updatesQueue.add('command-response', {
          requestId: command.requestId,
          commandType: command.type,
          error: err.message || String(err),
          context: command.context, // Echo back context from command
        });
      }
    });

    // Log when worker starts listening
    this.worker.on('ready', () => {
      console.log(`[DEBUG] ✅ Worker is now listening to queue: ${queueName}`);
    });
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
    await this.worker.close();
  }
}

