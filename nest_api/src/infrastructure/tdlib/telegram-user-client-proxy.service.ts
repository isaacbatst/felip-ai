import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import type {
  CommandContext,
  TdlibCommand,
  TdlibCommandType
} from '@felip-ai/shared-types';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RabbitMQPublisherService } from '../queue/rabbitmq/rabbitmq-publisher.service';
import { randomUUID } from 'node:crypto';

// Re-export for convenience
export type { CommandContext, TdlibCommand, TdlibCommandType };

interface TdlibHttpCommandRequest {
  type: 'sendMessage' | 'getChats' | 'getChat' | 'getAuthorizationState' | 'logOut' | 'getMe' | 'getUserId' | 'resendAuthenticationCode';
  payload: unknown;
}

interface TdlibHttpCommandResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Proxy service that sends commands to tdlib_worker
 * - Uses HTTP for synchronous responses for commands available in http-api.ts
 * - Uses RabbitMQ for async commands (login, provideAuthCode, providePassword)
 * Single Responsibility: dispatching commands to tdlib_worker via HTTP or RabbitMQ
 */
@Injectable()
export class TelegramUserClientProxyService implements OnModuleDestroy {
  private readonly logger = new Logger(TelegramUserClientProxyService.name);

  constructor(
    private readonly workerManager: WorkerManager,
    private readonly rabbitmqPublisher: RabbitMQPublisherService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    // RabbitMQ connection is managed by RabbitMQPublisherService
  }

  getQueueNameForUser(userId: string): string {
    return `tdlib-commands-${userId}`;
  }

  /**
   * Sends a command via HTTP and returns the result synchronously
   */
  private async sendHttpCommand(
    userId: string,
    command: TdlibHttpCommandRequest,
  ): Promise<unknown> {
    const port = await this.workerManager.getWorkerPort(userId);
    if (!port) {
      throw new Error(`No port found for worker user ${userId}. Worker may not be running.`);
    }

    const url = `http://${await this.workerManager.getHostname(userId)}:${port}/command`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as TdlibHttpCommandResponse;
    if (!data.success) {
      throw new Error(data.error || 'Command failed');
    }

    return data.result;
  }

  /**
   * Dispatches a command to the worker queue asynchronously (for commands not in http-api)
   * Responses are handled via events in the tdlib-updates queue
   */
  private async dispatchCommand(
    userId: string,
    command: TdlibCommand,
    context?: CommandContext,
  ): Promise<string> {
    const queueName = this.getQueueNameForUser(userId);
    const requestId = command.requestId || randomUUID();
    const commandWithRequestId = { 
      ...command, 
      requestId,
      context: context || command.context,
    };

    await this.rabbitmqPublisher.publishToQueue(queueName, {
      pattern: command.type,
      data: commandWithRequestId,
    });
    this.logger.debug(`Dispatched command ${command.type} for user ${userId} with requestId ${requestId}`);
    return requestId;
  }

  /**
   * Dispatches a command with context that will be echoed back in the response
   */
  async dispatchCommandWithContext(
    userId: string,
    command: Omit<TdlibCommand, 'context'>,
    context: CommandContext,
  ): Promise<string> {
    return this.dispatchCommand(userId, command, context);
  }

  /**
   * Sends a sendMessage command via HTTP (synchronous)
   */
  async sendMessage(userId: string, chatId: number, text: string, replyToMessageId?: number): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'sendMessage',
      payload: { chatId, text, replyToMessageId },
    });
  }

  /**
   * Dispatches a login command
   * Response will be sent via login-success/login-failure events in tdlib-updates queue
   * @param botUserId - Bot user ID (string) - identifies which bot user owns this worker
   * @param phoneNumber - Phone number to login with
   * @param telegramBotUserId - Telegram bot user ID (number) - the bot user ID from Telegram context
   * @param chatId - Chat ID where to send messages
   * @param requestId - Optional request ID. If not provided, a new one will be generated.
   */
  async login(botUserId: string, phoneNumber: string, requestId?: string): Promise<string> {
    const finalRequestId = requestId || randomUUID();
    await this.dispatchCommand(botUserId, {
      type: 'login',
      payload: { 
        phoneNumber, 
      },
      requestId: finalRequestId,
    });
    return finalRequestId;
  }

  /**
   * Dispatches a provideAuthCode command
   * Response will be sent via login-success/login-failure events in tdlib-updates queue
   * @param botUserId - Bot user ID (string) - identifies which bot user owns this worker
   * @param requestId - Request ID from login command
   * @param code - Authentication code
   * @param sessionData - Session data containing telegramBotUserId (number)
   */
  async provideAuthCode(
    botUserId: string,
    requestId: string,
    code: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<void> {
    await this.dispatchCommand(
      botUserId,
      {
        type: 'provideAuthCode',
        payload: { requestId, code, ...sessionData },
        requestId,
      },
      {
        userId: botUserId,
        commandType: 'provideAuthCode',
        chatId: sessionData.chatId,
      },
    );
  }

  /**
   * Dispatches a providePassword command
   * Response will be sent via login-success/login-failure events in tdlib-updates queue
   * @param botUserId - Bot user ID (string) - identifies which bot user owns this worker
   * @param requestId - Request ID from login command
   * @param password - Password
   * @param sessionData - Session data containing telegramBotUserId (number)
   */
  async providePassword(
    botUserId: string,
    requestId: string,
    password: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<void> {
    await this.dispatchCommand(botUserId, {
      type: 'providePassword',
      payload: { requestId, password, ...sessionData },
      requestId,
    });
  }

  /**
   * Sends a getChats command via HTTP (synchronous)
   */
  async getChats(userId: string, chatList: { _: string }, limit: number): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'getChats',
      payload: { chatList, limit },
    });
  }

  /**
   * Sends a getChat command via HTTP (synchronous)
   */
  async getChat(userId: string, chatId: number): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'getChat',
      payload: { chatId },
    });
  }

  /**
   * Sends a getAuthorizationState command via HTTP (synchronous)
   */
  async getAuthorizationState(userId: string): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'getAuthorizationState',
      payload: {},
    });
  }

  /**
   * Sends a logOut command via HTTP (synchronous)
   */
  async logOut(userId: string): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'logOut',
      payload: {},
    });
  }

  /**
   * Sends a getMe command via HTTP (synchronous)
   */
  async getMe(userId: string): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'getMe',
      payload: {},
    });
  }

  /**
   * Sends a getUserId command via HTTP (synchronous)
   */
  async getUserId(userId: string): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'getUserId',
      payload: {},
    });
  }

  /**
   * Sends a resendAuthenticationCode command via HTTP (synchronous)
   */
  async resendAuthenticationCode(userId: string): Promise<unknown> {
    return this.sendHttpCommand(userId, {
      type: 'resendAuthenticationCode',
      payload: {},
    });
  }
}

