import { getTdjson } from 'prebuilt-tdlib';
import type { Client } from 'tdl';
import { configure, createClient } from 'tdl';

// Configure tdl to use prebuilt-tdlib before creating any clients
configure({ tdjson: getTdjson() });

/**
 * Informações do usuário retornadas pelo getMe
 */
export interface TelegramUserInfo {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  usernames?: {
    editable_username?: string;
  };
  phone_number?: string;
}

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
export class TelegramUserClient {
  protected client: Client | null = null;
  private isShuttingDown = false;
  private isClientClosed = false;
  private readonly config: TelegramUserClientConfig;
  private updateHandlers: Array<(update: unknown) => void> = [];

  constructor(config: TelegramUserClientConfig) {
    console.log('[DEBUG] Creating Telegram User Client...', config);
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log('[DEBUG] Initializing Telegram User Client...');

    this.client = createClient({
      apiId: this.config.apiId,
      apiHash: this.config.apiHash,
      databaseDirectory: this.config.databaseDirectory,
      filesDirectory: this.config.filesDirectory,
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
    console.log('[DEBUG] Ensuring client...');
    if (!this.client) {
      console.log('[DEBUG] Client not available');
      throw new Error('Client not initialized');
    }
    console.log('[DEBUG] Client obtained');
    return this.client;
  }

  /**
   * Verifica se o cliente está fechado e recria se necessário
   */
  private async ensureClientReady(): Promise<Client> {
    if (this.isShuttingDown) {
      throw new Error('Client is shutting down');
    }

    // If client is closed, recreate it
    if (this.isClientClosed || !this.client) {
      console.log('[DEBUG] Client is closed, recreating...');
      await this.recreateClient();
    }

    return this.ensureClient();
  }

  /**
   * Recria o cliente após logout
   */
  private async recreateClient(): Promise<void> {
    // Close existing client if it exists
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore errors when closing an already closed client
        if (!(error instanceof Error && error.message.includes('authorizationStateClosed'))) {
          console.error('[ERROR] Error closing old client:', error);
        }
      }
    }

    // Reset closed flag
    this.isClientClosed = false;

    // Create new client
    this.client = createClient({
      apiId: this.config.apiId,
      apiHash: this.config.apiHash,
      databaseDirectory: this.config.databaseDirectory,
      filesDirectory: this.config.filesDirectory,
    });

    // Re-setup event handlers
    this.setupBasicEventHandlers();

    // Re-register update handlers directly (don't use onUpdate to avoid adding to array again)
    for (const handler of this.updateHandlers) {
      if (this.client) {
        this.client.on('update', (update: unknown) => {
          if (this.isShuttingDown) {
            return;
          }
          handler(update);
        });
      }
    }

    console.log('[DEBUG] ✅ Client recreated successfully');
  }

  /**
   * Invokes a TDLib method directly (for login flow)
   * Automatically recreates client if it was closed after logout
   */
  async invokeDirect(params: Parameters<Client['invoke']>[0]): Promise<unknown> {
    try {
      const client = await this.ensureClientReady();
      return client.invoke(params);
    } catch (error) {
      // If error indicates closed client, try to recreate and retry once
      if (
        error instanceof Error &&
        (error.message.includes('authorizationStateClosed') ||
          error.message.includes('Client is closed') ||
          error.message.includes('closed'))
      ) {
        console.log('[DEBUG] Client appears closed, recreating and retrying...');
        await this.recreateClient();
        const client = this.ensureClient();
        return client.invoke(params);
      }
      throw error;
    }
  }

  /**
   * Realiza login com configuração fornecida
   */
  async login(config: Parameters<Client['login']>[0]): Promise<void> {
    const client = await this.ensureClientReady();
    return client.login(config);
  }

  /**
   * Reenvia código de autenticação
   */
  async resendAuthenticationCode(): Promise<unknown> {
    const client = await this.ensureClientReady();
    return client.invoke({
      _: 'resendAuthenticationCode',
    });
  }

  /**
   * Obtém informações do usuário atual
   */
  async getMe(): Promise<TelegramUserInfo> {
    const client = await this.ensureClientReady();
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
    console.log('[DEBUG] Sending message:', { chatId, text, replyToMessageId });
    const client = await this.ensureClientReady();
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
    console.log('[DEBUG] Message params:', JSON.stringify(messageParams, null, 2));

    if (replyToMessageId !== undefined && replyToMessageId !== null && replyToMessageId > 0) {
      messageParams.reply_to = {
        _: 'inputMessageReplyToMessage',
        message_id: replyToMessageId,
      };
      console.log('[DEBUG] Reply parameters:', JSON.stringify(messageParams.reply_to, null, 2));
    } else if (replyToMessageId !== undefined) {
      console.log('[DEBUG] Invalid replyToMessageId:', replyToMessageId, '- skipping reply');
    }

    console.log('[DEBUG] Full message params:', JSON.stringify(messageParams, null, 2));
    const result = await client.invoke(messageParams as Parameters<typeof client.invoke>[0]);
    console.log('[DEBUG] sendMessage result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Creates a private chat with a user
   * Returns existing chat if one exists, creates it if it doesn't
   */
  async createPrivateChat(userId: number, force: boolean = false): Promise<{ id: number }> {
    const client = await this.ensureClientReady();
    const result = await client.invoke({
      _: 'createPrivateChat',
      user_id: userId,
      force,
    });
    return result as { id: number };
  }

  /**
   * Sends a message to a user by their user ID
   * Creates the private chat first if it doesn't exist
   */
  async sendMessageToUser(userId: number, text: string, replyToMessageId?: number): Promise<unknown> {
    const chat = await this.createPrivateChat(userId, true);
    return this.sendMessage(chat.id, text, replyToMessageId);
  }

  /**
   * Obtém lista de chats
   */
  async getChats(chatList: { _: string }, limit: number): Promise<unknown> {
    const client = await this.ensureClientReady();
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
    const client = await this.ensureClientReady();
    return client.invoke({
      _: 'getChat',
      chat_id: chatId,
    });
  }

  /**
   * Obtém todos os grupos/supergrupos do usuário
   * Combina getChats + getChat + filtragem em uma única operação
   * Retorna array de { id, title } para grupos e supergrupos
   */
  async getGroups(limit: number = 100): Promise<Array<{ id: number; title: string }>> {
    const client = await this.ensureClientReady();
    
    // Get list of chat IDs
    const chatsResult = await client.invoke({
      _: 'getChats',
      chat_list: { _: 'chatListMain' },
      limit,
    }) as { chat_ids?: number[] };

    if (!chatsResult?.chat_ids || !Array.isArray(chatsResult.chat_ids)) {
      return [];
    }

    const groups: Array<{ id: number; title: string }> = [];

    // Fetch each chat and filter for groups
    for (const chatId of chatsResult.chat_ids) {
      try {
        const chat = await client.invoke({
          _: 'getChat',
          chat_id: chatId,
        }) as {
          type?: { _?: string };
          title?: string;
        } | null;

        if (
          chat &&
          typeof chat === 'object' &&
          chat.type &&
          typeof chat.type === 'object' &&
          '_' in chat.type
        ) {
          const chatType = chat.type._;
          // Only include groups and supergroups
          if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
            const title = typeof chat.title === 'string' ? chat.title : 'Sem título';
            groups.push({ id: chatId, title });
          }
        }
      } catch (error) {
        console.warn(`[WARN] Error fetching chat ${chatId}:`, error);
        // Skip chats that we can't fetch
      }
    }

    return groups;
  }

  /**
   * Obtém uma mensagem específica por ID
   */
  async getMessage(chatId: number, messageId: number): Promise<unknown> {
    const client = await this.ensureClientReady();
    return client.invoke({
      _: 'getMessage',
      chat_id: chatId,
      message_id: messageId,
    });
  }

  /**
   * Obtém o estado atual de autorização
   */
  async getAuthorizationState(): Promise<unknown> {
    const client = await this.ensureClientReady();
    return client.invoke({
      _: 'getAuthorizationState',
    });
  }

  /**
   * Realiza logout
   */
  async logOut(): Promise<unknown> {
    if (this.isClientClosed) {
      console.log('[DEBUG] Client already closed, recreating for next use...');
      await this.recreateClient();
      return;
    }
    const client = await this.ensureClientReady();
    return client.invoke({
      _: 'logOut',
    });
  }

  /**
   * Searches for a public chat by username
   * Used to resolve @username to numeric Telegram user ID for blacklisting
   */
  async searchPublicChat(username: string): Promise<{ id: number; type: { _: string; user_id?: number }; title?: string } | null> {
    const client = await this.ensureClientReady();
    try {
      const result = await client.invoke({
        _: 'searchPublicChat',
        username: username.replace(/^@/, ''),
      });
      return result as { id: number; type: { _: string; user_id?: number }; title?: string };
    } catch {
      return null;
    }
  }

  /**
   * Searches for members in a chat/group by name query
   * Returns user info for each member found
   */
  async searchChatMembers(chatId: number, query: string): Promise<Array<{ userId: number; firstName: string; lastName: string; username: string | null }>> {
    const client = await this.ensureClientReady();
    const result = await client.invoke({
      _: 'searchChatMembers',
      chat_id: chatId,
      query,
      limit: 200,
    } as Parameters<typeof client.invoke>[0]) as { members?: Array<{ member_id?: { _?: string; user_id?: number } }> };

    const members: Array<{ userId: number; firstName: string; lastName: string; username: string | null }> = [];

    if (!result?.members || !Array.isArray(result.members)) {
      return members;
    }

    for (const member of result.members) {
      const memberId = member?.member_id;
      if (!memberId || memberId._  !== 'messageSenderUser' || !memberId.user_id) {
        continue;
      }
      try {
        const user = await client.invoke({
          _: 'getUser',
          user_id: memberId.user_id,
        }) as { id?: number; first_name?: string; last_name?: string; usernames?: { editable_username?: string } };

        members.push({
          userId: user.id ?? memberId.user_id,
          firstName: user.first_name ?? '',
          lastName: user.last_name ?? '',
          username: user.usernames?.editable_username ?? null,
        });
      } catch (error) {
        console.warn(`[WARN] Error fetching user ${memberId.user_id}:`, error);
      }
    }

    return members;
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
            console.log('[DEBUG] ⚠️ Authorization state closed - client will be recreated on next use');
            this.isClientClosed = true;
            return;
          }
          if (authState === 'authorizationStateReady') {
            console.log('[DEBUG] ✅ Authorization ready');
            this.isClientClosed = false; // Reset closed flag when ready
          } else if (authState === 'authorizationStateWaitPhoneNumber') {
            console.log('[DEBUG] 📱 Waiting for phone number...');
            this.isClientClosed = false; // Reset closed flag when waiting for phone
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
    // Store handler to re-register after client recreation
    this.updateHandlers.push(handler);

    if (!this.client) return;
    this.client.on('update', (update: unknown) => {
      if (this.isShuttingDown) {
        return;
      }
      handler(update);
    });
  }

  async close(): Promise<void> {
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

