import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { TelegramUserInfo } from './telegram-user-info.types';

export interface TdlibCommandRequest {
  type:
    | 'sendMessage'
    | 'login'
    | 'getChats'
    | 'getChat'
    | 'getAuthorizationState'
    | 'logOut'
    | 'getMe'
    | 'getUserId'
    | 'resendAuthenticationCode';
  payload: unknown;
}

export interface TdlibCommandResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface TdlibCommand {
  type:
    | 'sendMessage'
    | 'login'
    | 'getChats'
    | 'getChat'
    | 'getAuthorizationState'
    | 'logOut'
    | 'getMe'
    | 'getUserId'
    | 'resendAuthenticationCode'
    | 'provideAuthCode'
    | 'providePassword';
  payload: unknown;
  requestId?: string;
}

/**
 * Proxy service that sends commands to tdlib_worker via HTTP (for most operations) or BullMQ (for login with callbacks)
 * Single Responsibility: sending commands to tdlib_worker via HTTP requests or BullMQ
 */
@Injectable()
export class TelegramUserClientProxyService {
  private readonly workerBaseUrl: string;
  
  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('tdlib-commands') private readonly commandsQueue: Queue,
  ) {
    const workerHost = this.configService.get<string>('TDLIB_WORKER_HOST') || 'localhost';
    const workerPort = this.configService.get<string>('TDLIB_WORKER_PORT') || '3001';
    this.workerBaseUrl = `http://${workerHost}:${workerPort}`;
  }

  private async enqueueCommand(command: TdlibCommand): Promise<void> {
    await this.commandsQueue.add(command.type, command);
  }

  private async sendCommandViaHttp<T>(command: TdlibCommandRequest): Promise<T> {
    try {
      const response = await fetch(`${this.workerBaseUrl}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = (await response.json()) as TdlibCommandResponse;

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      return data.result as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to send command: ${String(error)}`);
    }
  }

  async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'sendMessage',
      payload: { chatId, text, replyToMessageId },
    });
  }

  async login(phoneNumber: string, userId: number, chatId: number): Promise<void> {
    // Generate a unique requestId for this login session
    const requestId = randomUUID();
    await this.enqueueCommand({
      type: 'login',
      payload: { phoneNumber, userId, chatId },
      requestId,
    });
  }

  async provideAuthCode(
    requestId: string,
    code: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<void> {
    await this.enqueueCommand({
      type: 'provideAuthCode',
      payload: { requestId, code, ...sessionData },
    });
  }

  async providePassword(
    requestId: string,
    password: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<void> {
    await this.enqueueCommand({
      type: 'providePassword',
      payload: { requestId, password, ...sessionData },
    });
  }

  async getChats(chatList: { _: string }, limit: number): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'getChats',
      payload: { chatList, limit },
    });
  }

  async getChat(chatId: number): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'getChat',
      payload: { chatId },
    });
  }

  async getAuthorizationState(): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'getAuthorizationState',
      payload: {},
    });
  }

  async logOut(): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'logOut',
      payload: {},
    });
  }

  async getMe(): Promise<TelegramUserInfo> {
    return this.sendCommandViaHttp<TelegramUserInfo>({
      type: 'getMe',
      payload: {},
    });
  }

  async getUserId(): Promise<number | null> {
    return this.sendCommandViaHttp<number | null>({
      type: 'getUserId',
      payload: {},
    });
  }

  async resendAuthenticationCode(): Promise<unknown> {
    return this.sendCommandViaHttp({
      type: 'resendAuthenticationCode',
      payload: {},
    });
  }
}

