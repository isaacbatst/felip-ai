import { Queue, Worker } from 'bullmq';
import { TelegramUserClient } from './telegram-user-client';
import { LoginSessionManager } from './login-session-manager';

export interface TdlibCommand {
  type: 'sendMessage' | 'login' | 'getChats' | 'getChat' | 'getAuthorizationState' | 'logOut' | 'getMe' | 'getUserId' | 'resendAuthenticationCode' | 'provideAuthCode' | 'providePassword';
  payload: unknown;
  requestId?: string;
}

/**
 * Processor responsável por processar comandos recebidos via BullMQ
 */
export class CommandProcessor {
  private worker: Worker;
  private responsesQueue: Queue;
  private updatesQueue: Queue;
  private loginSessionManager: LoginSessionManager;

  constructor(
    private readonly client: TelegramUserClient,
    redisConnection: { host: string; port: number; password?: string },
    queueName: string = 'tdlib-commands',
    responsesQueueName: string = 'tdlib-responses',
    updatesQueueName: string = 'tdlib-updates',
  ) {
    this.responsesQueue = new Queue(responsesQueueName, {
      connection: redisConnection,
    });

    this.updatesQueue = new Queue(updatesQueueName, {
      connection: redisConnection,
    });

    this.loginSessionManager = new LoginSessionManager(
      client,
      this.updatesQueue,
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
      console.log(`[DEBUG] Command processed: ${job.id}`);
      const command = job.data as TdlibCommand;
      if (command.requestId) {
        // Send response back to nest_api
        await this.responsesQueue.add('response', {
          requestId: command.requestId,
          result,
        });
      }
    });

    this.worker.on('failed', async (job, err) => {
      console.error(`[ERROR] Command failed: ${job?.id}`, err);
      const command = job?.data as TdlibCommand;
      if (command?.requestId) {
        // Send error response back to nest_api
        await this.responsesQueue.add('response', {
          requestId: command.requestId,
          error: err.message || String(err),
        });
      }
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
          const { phoneNumber, userId, chatId } = command.payload as {
            phoneNumber: string;
            userId: number;
            chatId: number;
          };
          if (!command.requestId) {
            throw new Error('Login command requires requestId');
          }
          await this.loginSessionManager.startLogin(
            phoneNumber,
            userId,
            chatId,
            command.requestId,
          );
          return undefined;
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

