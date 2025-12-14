import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getTdjson } from 'prebuilt-tdlib';
import { AppConfigService } from 'src/config/app.config';
import type { Client } from 'tdl';
import { configure, createClient } from 'tdl';
import type { TelegramUserInfo } from './telegram-user-login-handler';

// Configure tdl to use prebuilt-tdlib before creating any clients
configure({ tdjson: getTdjson() });

/**
 * Configuração para criar o cliente Telegram
 */
export interface TelegramUserClientConfig {
  apiId: number;
  apiHash: string;
  databaseDirectory?: string;
  filesDirectory?: string;
}

/**
 * Cliente base do Telegram User (TDLib)
 * Responsável por gerenciar o cliente e handlers básicos (erros, conexão, autorização)
 */
@Injectable()
export class TelegramUserClient implements OnModuleInit, OnModuleDestroy {
  protected client: Client | null = null;
  private isShuttingDown = false;
  private readonly config: TelegramUserClientConfig;

  constructor(private readonly appConfig: AppConfigService) {
    const apiId = this.appConfig.getTelegramApiId();
    const apiHash = this.appConfig.getTelegramApiHash();

    this.config = {
      apiId: Number.parseInt(apiId, 10),
      apiHash,
      databaseDirectory: this.appConfig.getTelegramDatabaseDirectory(),
      filesDirectory: this.appConfig.getTelegramFilesDirectory(),
    };
  }

  async onModuleInit(): Promise<void> {
    console.log('[DEBUG] Initializing Telegram User Client (POC)...');

    this.client = createClient({
      apiId: this.config.apiId,
      apiHash: this.config.apiHash,
    });

    this.setupBasicEventHandlers();

    // Check if user is already logged in
    await this.checkLoginStatus();

    console.log('[DEBUG] ✅ Telegram User Client initialized');
  }

  /**
   * Verifica se está em processo de shutdown
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Verifica se o cliente está inicializado
   */
  private ensureClient(): Client {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    return this.client;
  }

  /**
   * Realiza login com configuração fornecida
   */
  async login(config: Parameters<Client['login']>[0]): Promise<void> {
    const client = this.ensureClient();
    return client.login(config);
  }

  /**
   * Reenvia código de autenticação
   */
  async resendAuthenticationCode(): Promise<unknown> {
    const client = this.ensureClient();
    return client.invoke({
      _: 'resendAuthenticationCode',
    });
  }

  /**
   * Obtém informações do usuário atual
   */
  async getMe(): Promise<TelegramUserInfo> {
    const client = this.ensureClient();
    const me = await client.invoke({
      _: 'getMe',
    });
    return me as TelegramUserInfo;
  }

  /**
   * Envia uma mensagem de texto
   */
  async sendMessage(
    chatId: number,
    text: string,
    replyToMessageId?: number,
  ): Promise<unknown> {
    const client = this.ensureClient();
    const messageParams: Record<string, unknown> = {
      _: 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: {
          _: 'formattedText',
          text,
        },
      },
    };

    if (replyToMessageId !== undefined) {
      messageParams.reply_to_message_id = replyToMessageId;
    }

    return client.invoke(messageParams as Parameters<typeof client.invoke>[0]);
  }

  /**
   * Obtém lista de chats
   */
  async getChats(chatList: { _: string }, limit: number): Promise<unknown> {
    const client = this.ensureClient();
    const params: Record<string, unknown> = {
      _: 'getChats',
      chat_list: chatList,
      limit,
    };
    return client.invoke(params as Parameters<typeof client.invoke>[0]);
  }

  /**
   * Obtém detalhes de um chat específico
   */
  async getChat(chatId: number): Promise<unknown> {
    const client = this.ensureClient();
    return client.invoke({
      _: 'getChat',
      chat_id: chatId,
    });
  }

  /**
   * Obtém o estado atual de autorização
   */
  async getAuthorizationState(): Promise<unknown> {
    const client = this.ensureClient();
    return client.invoke({
      _: 'getAuthorizationState',
    });
  }

  /**
   * Realiza logout
   */
  async logOut(): Promise<unknown> {
    const client = this.ensureClient();
    return client.invoke({
      _: 'logOut',
    });
  }

  /**
   * Gets the current user's ID (bot's own user ID)
   * Fetches directly from the API each time
   */
  async getUserId(): Promise<number | null> {
    try {
      const me = await this.getMe();
      return me.id;
    } catch (error) {
      console.log('[DEBUG] Could not fetch user ID:', error);
      return null;
    }
  }

  /**
   * Verifica se o usuário já está logado
   */
  private async checkLoginStatus(): Promise<void> {
    if (!this.client) return;

    try {
      // Wait a bit for the client to initialize and connect
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check authorization state
      const authState = await this.getAuthorizationState();

      if (
        typeof authState === 'object' &&
        authState !== null &&
        '_' in authState &&
        (authState as { _: string })._ === 'authorizationStateReady'
      ) {
        console.log('[DEBUG] ✅ User is already logged in');
        
        // Fetch user info to confirm
        try {
          const me = await this.getMe();
          console.log(
            `[DEBUG] ✅ Logged in as: ${me.first_name || 'Unknown'} (ID: ${me.id})`,
          );
        } catch (error) {
          console.log('[DEBUG] Could not fetch user info:', error);
        }
      } else {
        const stateType =
          typeof authState === 'object' && authState !== null && '_' in authState
            ? (authState as { _: string })._
            : 'unknown';
        console.log(`[DEBUG] User is not logged in (state: ${stateType})`);
      }
    } catch (error) {
      console.log('[DEBUG] Could not check login status:', error);
    }
  }

  /**
   * Configura handlers básicos: erros, conexão e autorização
   */
  private setupBasicEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (error) => {
      if (this.isShuttingDown) {
        return;
      }
      if (error instanceof Error && error.message.includes('authorizationStateClosed')) {
        return;
      }
      console.error('[ERROR] Telegram User Client error:', error);
    });

    this.client.on('update', (update: unknown) => {
      if (this.isShuttingDown) {
        return;
      }
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateConnectionState') {
          const stateObj = update as { state?: { _?: string } };
          const state = stateObj?.state?._;
          if (state === 'connectionStateReady') {
            console.log('[DEBUG] ✅ Telegram User Client connected and ready');
          } else if (state === 'connectionStateConnecting') {
            console.log('[DEBUG] 🔄 Telegram User Client connecting...');
          }
        } else if (updateType === 'updateAuthorizationState') {
          const authObj = update as { authorization_state?: { _?: string } };
          const authState = authObj?.authorization_state?._;
          if (authState === 'authorizationStateClosed') {
            return;
          }
          if (authState === 'authorizationStateReady') {
            console.log('[DEBUG] ✅ Authorization ready');
          } else if (authState === 'authorizationStateWaitPhoneNumber') {
            console.log('[DEBUG] 📱 Waiting for phone number...');
          } else if (authState === 'authorizationStateWaitCode') {
            console.log('[DEBUG] 🔐 Waiting for code...');
          } else if (authState === 'authorizationStateWaitPassword') {
            console.log('[DEBUG] 🔒 Waiting for password...');
          }
        }
      }
    });
  }

  /**
   * Adiciona um handler customizado para updates
   * Permite que outros handlers registrem seus próprios listeners
   */
  onUpdate(handler: (update: unknown) => void): void {
    if (!this.client) return;
    this.client.on('update', (update: unknown) => {
      if (this.isShuttingDown) {
        return;
      }
      handler(update);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.client) {
      try {
        console.log('[DEBUG] Closing Telegram User Client...');
        await this.client.close();
        console.log('[DEBUG] Telegram User Client closed successfully');
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('authorizationStateClosed'))) {
          console.error('[ERROR] Error closing Telegram User Client:', error);
        }
      }
    }
  }
}
