import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotService } from '../telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from './telegram-user-client-proxy.service';
import { ActiveGroupsRepository } from '../persistence/active-groups.repository';
import { UserRepository } from '../persistence/user.repository';
import { AuthErrorCacheService } from './auth-error-cache.service';
import type {
  CommandContext,
  GetChatCommandContext,
  GetUserIdCommandContext,
  GetChatValidateForActivationMetadata,
  GetChatGetTitleForActiveGroupMetadata,
  GetUserIdActivateGroupsMetadata,
  GetUserIdDeactivateGroupsMetadata,
  GetUserIdListActiveGroupsMetadata,
  BatchStateMetadata,
} from '@felip-ai/shared-types';

export interface CommandResponse {
  requestId: string;
  commandType: string;
  result?: unknown;
  error?: string;
  context: CommandContext;
}

/**
 * Handler for processing command responses from tdlib_worker
 * Single Responsibility: handling command responses and taking appropriate action
 */
interface BatchState {
  chatIds: number[];
  results: Map<number, unknown>; // chatId -> result
  completed: number;
  total: number;
  context: Omit<CommandContext, 'metadata'> & { metadata?: BatchStateMetadata };
}

/**
 * Tracks sent error messages to prevent duplicates
 * Key: `${requestId}:${commandType}:${errorMessage}`
 * Value: timestamp when error was sent
 */
interface SentError {
  timestamp: number;
  chatId: number;
}

@Injectable()
export class TdlibCommandResponseHandler {
  private readonly logger = new Logger(TdlibCommandResponseHandler.name);
  // In-memory batch state tracking (for aggregation across multiple async responses)
  // Note: For multi-instance deployments, this should be moved to Redis
  private readonly batchStates = new Map<string, BatchState>();
  // Track sent error messages to prevent duplicates (key: requestId:commandType:error, value: timestamp)
  private readonly sentErrors = new Map<string, SentError>();
  // Cleanup old error entries every 5 minutes
  private readonly errorCleanupInterval = 5 * 60 * 1000; // 5 minutes
  private readonly errorRetentionTime = 10 * 60 * 1000; // Keep errors for 10 minutes
  // Rate limiting: max 1 error message per chatId per 30 seconds
  private readonly errorRateLimitMs = 30 * 1000; // 30 seconds

  constructor(
    private readonly botService: TelegramBotService,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
    private readonly userRepository: UserRepository,
    private readonly authErrorCache: AuthErrorCacheService,
  ) {
    // Start cleanup interval
    setInterval(() => this.cleanupOldErrors(), this.errorCleanupInterval);
  }

  async handleResponse(response: CommandResponse): Promise<void> {
    const { commandType, result, error, context, requestId } = response;

    if (error) {
      await this.handleError(commandType, error, context, requestId);
      return;
    }

    switch (commandType) {
      case 'getChats':
        // getChats is now handled synchronously via HTTP in command handlers
        this.logger.debug('getChats response received (should not happen for HTTP calls)', { result, context });
        break;
      case 'getChat':
        await this.handleGetChatResponse(result, context);
        break;
      case 'getChatsGroups':
        // This is handled by individual getChat responses
        break;
      case 'activateGroups':
        // This is handled by individual getChat responses
        break;
      case 'listActiveGroups':
        // This is handled by individual getChat responses
        break;
      case 'getUserId':
        await this.handleGetUserIdResponse(result, context);
        break;
      case 'getAuthorizationState':
        await this.handleGetAuthorizationStateResponse(result, context);
        break;
      case 'logOut':
        await this.handleLogOutResponse(result, context);
        break;
      case 'getMe':
        await this.handleGetMeResponse(result, context);
        break;
      case 'sendMessage':
        await this.handleSendMessageResponse(result, context);
        break;
      case 'resendAuthenticationCode':
        await this.handleResendAuthenticationCodeResponse(result, context);
        break;
      case 'provideAuthCode':
        // provideAuthCode response is handled via login-success/login-failure events
        // This is just a confirmation that the code was received
        this.logger.debug('provideAuthCode response received', { result, context });
        break;
      case 'providePassword':
        // providePassword response is handled via login-success/login-failure events
        // This is just a confirmation that the password was received
        this.logger.debug('providePassword response received', { result, context });
        break;
      default:
        this.logger.warn(`Unknown command type in response: ${commandType}`);
    }
  }

  private async handleError(commandType: string, error: string, context: CommandContext, requestId: string): Promise<void> {
    this.logger.error(`${commandType} failed: ${error}`, { context, requestId });

    // Store auth errors in bot_status for web logins (where chatId is 0)
    if (context.userId && (commandType === 'providePassword' || commandType === 'provideAuthCode')) {
      const isRateLimit = error.includes('Too Many Requests') || error.includes('retry after') || error.toLowerCase().includes('rate limit') || error.includes('PHONE_PASSWORD_FLOOD');
      const isPasswordInvalid = error.includes('PASSWORD_HASH_INVALID') || error.includes('password invalid') || error.toLowerCase().includes('invalid password');
      const isCodeInvalid = error.includes('PHONE_CODE_INVALID') || error.includes('phone code invalid') || error.toLowerCase().includes('invalid code');
      const isCodeExpired = error.includes('PHONE_CODE_EXPIRED') || error.includes('phone code expired') || error.includes('code expired') || (error.includes('expired') && error.includes('code'));

      let authError: string | null = null;

      if (isRateLimit) {
        const retryMatch = error.match(/retry after (\d+)/i);
        const retrySeconds = retryMatch ? retryMatch[1] : '0';
        authError = `FLOOD_WAIT:${retrySeconds}`;
      } else if (commandType === 'providePassword' && isPasswordInvalid) {
        authError = 'PASSWORD_INVALID';
      } else if (commandType === 'provideAuthCode' && isCodeInvalid) {
        authError = 'CODE_INVALID';
      } else if (commandType === 'provideAuthCode' && isCodeExpired) {
        authError = 'CODE_EXPIRED';
      }

      if (authError) {
        this.authErrorCache.set(context.userId.toString(), authError);
      }
    }

    if (!context.chatId) {
      return;
    }

    const effectiveRequestId = requestId || 'unknown';
    const errorKey = `${effectiveRequestId}:${commandType}:${error}`;
    const now = Date.now();

    // Check if we've already sent this exact error recently (deduplication)
    const sentError = this.sentErrors.get(errorKey);
    if (sentError && sentError.chatId === context.chatId) {
      const timeSinceSent = now - sentError.timestamp;
      if (timeSinceSent < this.errorRetentionTime) {
        this.logger.debug(`Skipping duplicate error message: ${errorKey} (sent ${timeSinceSent}ms ago)`);
        return;
      }
    }

    // Rate limiting: check if we've sent any error to this chat recently
    const recentErrors = Array.from(this.sentErrors.values())
      .filter(e => e.chatId === context.chatId && (now - e.timestamp) < this.errorRateLimitMs);
    if (recentErrors.length > 0) {
      this.logger.debug(`Rate limiting error message to chatId ${context.chatId} (${recentErrors.length} recent errors)`);
      return;
    }

    // Handle PHONE_CODE_EXPIRED errors specially - automatically resend code
    const isPhoneCodeExpired = error.includes('PHONE_CODE_EXPIRED') || 
                               error.includes('phone code expired') ||
                               error.includes('code expired') ||
                               (error.includes('expired') && error.includes('code')) ||
                               error.includes('compartilhado anteriormente') || // Portuguese: "shared previously"
                               error.includes('shared previously');
    
    if (isPhoneCodeExpired && commandType === 'provideAuthCode') {
      // Try to automatically restart login to generate a new code
      if (context.userId) {
        try {
          const telegramUserId = Number.parseInt(context.userId.toString(), 10);
          const user = !Number.isNaN(telegramUserId)
            ? await this.userRepository.findByTelegramUserId(telegramUserId)
            : null;
          if (user?.phone) {
            this.logger.log(`Restarting login to generate new code for userId: ${context.userId} due to expired code`);
            try {
              await this.telegramUserClient.login(context.userId.toString(), user.phone);

              // Track that we've sent this error
              this.sentErrors.set(errorKey, { timestamp: now, chatId: context.chatId });

              await this.botService.bot.api.sendMessage(
                context.chatId,
                '⏰ O código expirou. Um novo código está sendo gerado automaticamente...\n\n' +
                'Por favor, aguarde alguns segundos e insira o novo código no painel.',
              );
              return;
            } catch (restartError) {
              this.logger.error(`Failed to restart login for new code: ${restartError}`, { userId: context.userId });
            }
          }
        } catch (userError) {
          this.logger.error(`Failed to handle expired code for userId ${context.userId}:`, userError);
        }
      }

      // If restart failed or user not found, show error message
      this.sentErrors.set(errorKey, { timestamp: now, chatId: context.chatId });
      await this.botService.bot.api.sendMessage(
        context.chatId,
        '⏰ O código expirou.\n\n' +
        'Por favor, inicie o processo de login novamente pelo painel para receber um novo código.',
      );
      return;
    }

    // Handle PHONE_CODE_INVALID errors specially - clear session and prevent retries
    const isPhoneCodeInvalid = error.includes('PHONE_CODE_INVALID') || 
                               error.includes('phone code invalid') ||
                               error.toLowerCase().includes('invalid code');
    
    if (isPhoneCodeInvalid && commandType === 'provideAuthCode') {
      // Track that we've sent this error
      this.sentErrors.set(errorKey, { timestamp: now, chatId: context.chatId });

      await this.botService.bot.api.sendMessage(
        context.chatId,
        '❌ Código de autenticação inválido.\n\n' +
        'Por favor, inicie o processo de login novamente pelo painel.',
      );
      return;
    }

    // Handle PASSWORD_HASH_INVALID errors - wrong 2FA password
    const isPasswordInvalid = error.includes('PASSWORD_HASH_INVALID') || 
                              error.includes('password invalid') ||
                              error.toLowerCase().includes('invalid password');
    
    if (isPasswordInvalid && commandType === 'providePassword') {
      // Track that we've sent this error
      this.sentErrors.set(errorKey, { timestamp: now, chatId: context.chatId });

      await this.botService.bot.api.sendMessage(
        context.chatId,
        '❌ Senha incorreta.\n\n' +
        'Por favor, verifique sua senha de dois fatores e tente novamente pelo painel.',
      );
      return;
    }

    // Check if this is a rate limit error and provide a more helpful message
    const isRateLimitError = error.includes('Too Many Requests') ||
                             error.includes('retry after') ||
                             error.toLowerCase().includes('rate limit') ||
                             error.includes('PHONE_PASSWORD_FLOOD');
    
    let errorMessage: string;
    if (isRateLimitError && (commandType === 'provideAuthCode' || commandType === 'providePassword')) {
      // Extract retry after time if available
      const retryMatch = error.match(/retry after (\d+)/i);
      const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
      const retryMinutes = retrySeconds ? Math.ceil(retrySeconds / 60) : null;
      
      errorMessage = '⏳ Muitas tentativas. Por favor, aguarde um momento antes de tentar novamente.';
      if (retryMinutes) {
        errorMessage += `\n\nTente novamente em aproximadamente ${retryMinutes} minuto(s).`;
      }
    } else {
      errorMessage = `❌ Erro ao executar comando ${commandType}: ${error}`;
    }
    
    // Track that we've sent this error
    this.sentErrors.set(errorKey, { timestamp: now, chatId: context.chatId });

    await this.botService.bot.api.sendMessage(
      context.chatId,
      errorMessage,
    );
  }

  /**
   * Cleanup old error entries to prevent memory leaks
   */
  private cleanupOldErrors(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, sentError] of this.sentErrors.entries()) {
      if (now - sentError.timestamp > this.errorRetentionTime) {
        this.sentErrors.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} old error entries`);
    }
  }


  private async handleGetChatResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'getChat') {
      this.logger.warn(`Invalid command type for handleGetChatResponse: ${context.commandType}`);
      return;
    }

    const getChatContext = context as GetChatCommandContext;
    const metadata = getChatContext.metadata;
    
    if (!metadata) {
      return;
    }

    const chatIdToFetch = metadata.chatIdToFetch;

    switch (metadata.action) {
      case 'validateForActivation': {
        await this.handleGetChatForActivation(result, chatIdToFetch, getChatContext);
        break;
      }
      case 'getTitleForActiveGroup': {
        await this.handleGetChatForActiveGroupsList(result, chatIdToFetch, getChatContext);
        break;
      }
      case 'listGroups':
        // listGroups is now handled synchronously via HTTP in command handlers
        this.logger.debug('getChat listGroups response received (should not happen for HTTP calls)', { result, context });
        break;
      default:
        this.logger.warn(`Unknown action for getChat: ${(metadata as { action?: string }).action}`);
    }
  }

  private async handleGetChatForActivation(
    result: unknown,
    chatIdToFetch: number,
    context: GetChatCommandContext,
  ): Promise<void> {
    const metadata = context.metadata as GetChatValidateForActivationMetadata | undefined;
    if (!metadata || metadata.action !== 'validateForActivation') {
      return;
    }

    const batchId = metadata.batchId;

    const batchState = this.batchStates.get(batchId);
    if (!batchState) {
      return;
    }

    const batchMetadata = batchState.context.metadata as BatchStateMetadata | undefined;
    if (!batchMetadata) {
      return;
    }

    const telegramUserId = batchMetadata.telegramUserId;
    const validatedGroups = batchMetadata.validatedGroups || [];
    const notFoundIds = batchMetadata.notFoundIds || [];
    const invalidGroupIds = batchMetadata.invalidGroupIds || [];

    // Process this result
    if (
      result &&
      typeof result === 'object' &&
      'type' in result &&
      result.type &&
      typeof result.type === 'object' &&
      '_' in result.type
    ) {
      const chatType = (result.type as { _: string })._;
      // Only allow groups and supergroups
      if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
        const title = 'title' in result && typeof result.title === 'string' ? result.title : 'Sem título';
        validatedGroups.push({ id: chatIdToFetch, title });
      } else {
        invalidGroupIds.push(chatIdToFetch);
      }
    } else {
      notFoundIds.push(chatIdToFetch);
    }

    // Update batch state
    const currentMetadata = batchState.context.metadata;
    if (currentMetadata) {
      currentMetadata.validatedGroups = validatedGroups;
      currentMetadata.notFoundIds = notFoundIds;
      currentMetadata.invalidGroupIds = invalidGroupIds;
    }
    batchState.completed++;

    // If all chats have been fetched, process activation
    if (batchState.completed === batchState.total && batchState.context.chatId && telegramUserId) {
      await this.processActivateGroups(validatedGroups, notFoundIds, invalidGroupIds, telegramUserId, batchState.context.chatId);
      this.batchStates.delete(batchId);
    }
  }

  private async handleGetChatForActiveGroupsList(
    result: unknown,
    chatIdToFetch: number,
    context: GetChatCommandContext,
  ): Promise<void> {
    const metadata = context.metadata as GetChatGetTitleForActiveGroupMetadata | undefined;
    if (!metadata || metadata.action !== 'getTitleForActiveGroup') {
      return;
    }

    const batchId = metadata.batchId;

    const batchState = this.batchStates.get(batchId);
    if (!batchState) {
      return;
    }

    const grupos = (batchState.context.metadata?.grupos as Array<{ id: number; title: string }>) || [];

    // Process this result
    if (
      result &&
      typeof result === 'object' &&
      'title' in result &&
      typeof result.title === 'string'
    ) {
      grupos.push({ id: chatIdToFetch, title: result.title });
    } else {
      // If we can't get the title, just show the ID
      grupos.push({ id: chatIdToFetch, title: 'Nome não disponível' });
    }

    // Update batch state
    const currentMetadata = batchState.context.metadata;
    if (currentMetadata) {
      currentMetadata.grupos = grupos;
    }
    batchState.completed++;

    // If all chats have been fetched, send the response
    if (batchState.completed === batchState.total && batchState.context.chatId) {
      await this.sendActiveGroupsList(grupos, batchState.context.chatId);
      this.batchStates.delete(batchId);
    }
  }


  private async processActivateGroups(
    validatedGroups: Array<{ id: number; title: string }>,
    notFoundIds: number[],
    invalidGroupIds: number[],
    telegramUserId: number,
    chatId: number,
  ): Promise<void> {
    // If no valid groups found, return error
    if (validatedGroups.length === 0) {
      let errorMessage = '❌ Nenhum grupo válido encontrado.\n\n';
      if (notFoundIds.length > 0) {
        errorMessage += `Grupos não encontrados: \`${notFoundIds.join(', ')}\`\n\n`;
      }
      if (invalidGroupIds.length > 0) {
        errorMessage += `IDs não são grupos: \`${invalidGroupIds.join(', ')}\`\n\n`;
      }
      errorMessage += 'Verifique se os IDs estão corretos e se você tem acesso aos grupos.';
      errorMessage += 'Use o comando /grupos para ver a lista de grupos que você está participando.';
      await this.botService.bot.api.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
      return;
    }

    // Get current active groups
    const currentActiveGroups = await this.activeGroupsRepository.getActiveGroups(telegramUserId.toString());
    const activeGroupsSet = new Set(currentActiveGroups || []);

    // Add new validated group IDs
    const newGroups: Array<{ id: number; title: string }> = [];
    const alreadyActiveGroups: Array<{ id: number; title: string }> = [];

    for (const grupo of validatedGroups) {
      if (!activeGroupsSet.has(grupo.id)) {
        activeGroupsSet.add(grupo.id);
        newGroups.push(grupo);
      } else {
        alreadyActiveGroups.push(grupo);
      }
    }

    // Save updated active groups
    const updatedActiveGroups = Array.from(activeGroupsSet);
    await this.activeGroupsRepository.setActiveGroups(telegramUserId.toString(), updatedActiveGroups);

    // Build response message
    let message = '';
    
    if (newGroups.length > 0) {
      message = `✅ ${newGroups.length} grupo(s) ativado(s) com sucesso!\n\n`;
      message += `📋 Grupos ativos:\n\n`;
      newGroups.forEach((grupo, index) => {
        message += `${index + 1}. ${grupo.title}\n\`${grupo.id}\`\n\n`;
      });
      message += `Total de grupos ativos: ${updatedActiveGroups.length}`;
    } else {
      message = `ℹ️ Todos os grupos fornecidos já estavam ativos.\n\n`;
      message += `📋 Grupos já ativos:\n\n`;
      alreadyActiveGroups.forEach((grupo, index) => {
        message += `${index + 1}. ${grupo.title}\n\`ID: ${grupo.id}\`\n\n`;
      });
      message += `Total de grupos ativos: ${updatedActiveGroups.length}`;
    }

    // Add warnings for not found or invalid groups
    if (notFoundIds.length > 0 || invalidGroupIds.length > 0) {
      message += '\n\n⚠️ Atenção:\n';
      if (notFoundIds.length > 0) {
        message += `Grupos não encontrados: \`${notFoundIds.join(', ')}\`\n`;
      }
      if (invalidGroupIds.length > 0) {
        message += `IDs não são grupos: \`${invalidGroupIds.join(', ')}\`\n`;
      }
    }

    await this.botService.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  }

  private async sendActiveGroupsList(grupos: Array<{ id: number; title: string }>, chatId: number): Promise<void> {
    // Format the response
    let message = `✅ Grupos Ativos (${grupos.length}):\n\n`;
    grupos.forEach((grupo, index) => {
      message += `${index + 1}. ${grupo.title}\n\`${grupo.id}\`\n\n`;
    });

    // Telegram has a message length limit, so split if needed
    const maxLength = 4096;
    if (message.length > maxLength) {
      const chunks: string[] = [];
      let currentChunk = `✅ Grupos Ativos (${grupos.length}):\n\n`;
      let count = 0;

      for (const grupo of grupos) {
        const grupoLine = `${count + 1}. ${grupo.title}\n\`ID: ${grupo.id}\`\n\n`;
        if (currentChunk.length + grupoLine.length > maxLength) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        currentChunk += grupoLine;
        count++;
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // Send all chunks
      for (const chunk of chunks) {
        await this.botService.bot.api.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      }
    } else {
      await this.botService.bot.api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  }


  private async handleGetUserIdResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'getUserId') {
      this.logger.warn(`Invalid command type for handleGetUserIdResponse: ${context.commandType}`);
      return;
    }

    const getUserIdContext = context as GetUserIdCommandContext;
    // result is the telegramUserId (number) - the Telegram account user ID
    // context.userId is botUserId (string) - identifies which bot user owns this worker
    const telegramUserId = result as number | null;
    
    if (!telegramUserId) {
      if (getUserIdContext.chatId) {
        await this.botService.bot.api.sendMessage(
          getUserIdContext.chatId,
          '❌ Cliente Telegram não está logado. Por favor, faça login primeiro.',
        );
      }
      return;
    }

    const metadata = getUserIdContext.metadata;
    if (!metadata) {
      this.logger.debug('getUserId response received without metadata', { 
        telegramUserId, 
        botUserId: getUserIdContext.userId,
      });
      return;
    }

    switch (metadata.action) {
      case 'activateGroups':
        await this.handleActivateGroups(telegramUserId, getUserIdContext);
        break;
      case 'deactivateGroups':
        await this.handleDeactivateGroups(telegramUserId, getUserIdContext);
        break;
      case 'listActiveGroups':
        await this.handleListActiveGroups(telegramUserId, getUserIdContext);
        break;
      default:
        this.logger.debug('getUserId response received', { 
          telegramUserId, 
          botUserId: getUserIdContext.userId,
          action: (metadata as { action?: string }).action,
        });
    }
  }

  private async handleActivateGroups(telegramUserId: number, context: GetUserIdCommandContext): Promise<void> {
    if (!context.chatId) {
      this.logger.warn('No chatId in context for activateGroups');
      return;
    }

    const metadata = context.metadata as GetUserIdActivateGroupsMetadata | undefined;
    if (!metadata || metadata.action !== 'activateGroups') {
      this.logger.warn('Invalid metadata for activateGroups');
      return;
    }

    const groupIds = metadata.groupIds;
    if (!groupIds || groupIds.length === 0) {
      await this.botService.bot.api.sendMessage(context.chatId, '❌ Nenhum ID válido fornecido.');
      return;
    }

    // Dispatch getChat for each groupId to validate them
    const batchId = `activateGroups-${context.userId}-${Date.now()}`;
    
    // Initialize batch state
    this.batchStates.set(batchId, {
      chatIds: groupIds,
      results: new Map(),
      completed: 0,
      total: groupIds.length,
      context: {
        userId: context.userId,
        commandType: context.commandType,
        chatId: context.chatId,
        metadata: {
          batchId,
          ...(context.metadata || {}),
          telegramUserId,
          validatedGroups: [],
          notFoundIds: [],
          invalidGroupIds: [],
        } as BatchStateMetadata,
      },
    });

    // Dispatch getChat for each groupId with context
    for (const groupId of groupIds) {
      await this.telegramUserClient.dispatchCommandWithContext(
        context.userId,
        {
          type: 'getChat',
          payload: { chatId: groupId },
        },
        {
          userId: context.userId,
          commandType: 'getChat',
          chatId: context.chatId,
          metadata: {
            batchId,
            chatIdToFetch: groupId,
            action: 'validateForActivation',
          } satisfies GetChatValidateForActivationMetadata,
        },
      );
    }
  }

  private async handleDeactivateGroups(telegramUserId: number, context: GetUserIdCommandContext): Promise<void> {
    if (!context.chatId) {
      this.logger.warn('No chatId in context for deactivateGroups');
      return;
    }

    const metadata = context.metadata as GetUserIdDeactivateGroupsMetadata | undefined;
    if (!metadata || metadata.action !== 'deactivateGroups') {
      this.logger.warn('Invalid metadata for deactivateGroups');
      return;
    }

    const groupIds = metadata.groupIds;
    if (!groupIds || groupIds.length === 0) {
      await this.botService.bot.api.sendMessage(context.chatId, '❌ Nenhum ID válido fornecido.');
      return;
    }

    // Get current active groups
    const currentActiveGroups = await this.activeGroupsRepository.getActiveGroups(telegramUserId.toString());
    if (!currentActiveGroups || currentActiveGroups.length === 0) {
      await this.botService.bot.api.sendMessage(context.chatId, 'ℹ️ Você não tem grupos ativos no momento.');
      return;
    }

    // Remove group IDs
    let removedCount = 0;
    const notFoundIds: number[] = [];

    for (const groupId of groupIds) {
      if (currentActiveGroups.includes(groupId)) {
        await this.activeGroupsRepository.removeActiveGroup(telegramUserId.toString(), groupId);
        removedCount++;
      } else {
        notFoundIds.push(groupId);
      }
    }

    // Get updated active groups count
    const updatedActiveGroups = await this.activeGroupsRepository.getActiveGroups(telegramUserId.toString());
    const remainingCount = updatedActiveGroups?.length || 0;

    let message = '';
    if (removedCount > 0) {
      message = `✅ ${removedCount} grupo(s) desativado(s) com sucesso!\n\n`;
      message += `Grupos ativos restantes: ${remainingCount}\n`;
      message += `Grupos desativados: ${groupIds.filter(id => !notFoundIds.includes(id)).join(', ')}`;
      
      if (notFoundIds.length > 0) {
        message += `\n\n⚠️ Os seguintes grupos não estavam ativos: ${notFoundIds.join(', ')}`;
      }
    } else {
      message = `ℹ️ Nenhum dos grupos fornecidos estava ativo.\n\n`;
      message += `Grupos não encontrados: ${notFoundIds.join(', ')}`;
    }

    await this.botService.bot.api.sendMessage(context.chatId, message);
  }

  private async handleListActiveGroups(telegramUserId: number, context: GetUserIdCommandContext): Promise<void> {
    if (!context.chatId) {
      this.logger.warn('No chatId in context for listActiveGroups');
      return;
    }

    const metadata = context.metadata as GetUserIdListActiveGroupsMetadata | undefined;
    if (!metadata || metadata.action !== 'listActiveGroups') {
      this.logger.warn('Invalid metadata for listActiveGroups');
      return;
    }

    // Get active groups from repository
    const activeGroups = await this.activeGroupsRepository.getActiveGroups(telegramUserId.toString());
    
    if (!activeGroups || activeGroups.length === 0) {
      await this.botService.bot.api.sendMessage(
        context.chatId,
        '📭 Você não tem grupos ativos no momento.\n\nUse /ativar para ativar grupos.',
      );
      return;
    }

    // Dispatch getChat for each active group to get titles
    const batchId = `listActiveGroups-${context.userId}-${Date.now()}`;
    
    // Initialize batch state
    this.batchStates.set(batchId, {
      chatIds: activeGroups,
      results: new Map(),
      completed: 0,
      total: activeGroups.length,
      context: {
        ...context,
        metadata: {
          batchId,
          ...(context.metadata as unknown as Record<string, unknown> || {}),
          telegramUserId,
          grupos: [],
        } as BatchStateMetadata,
      },
    });

    // Dispatch getChat for each active group with context
    for (const groupId of activeGroups) {
      await this.telegramUserClient.dispatchCommandWithContext(
        context.userId,
        {
          type: 'getChat',
          payload: { chatId: groupId },
        },
        {
          userId: context.userId,
          commandType: 'getChat',
          chatId: context.chatId,
          metadata: {
            batchId,
            chatIdToFetch: groupId,
            action: 'getTitleForActiveGroup',
          },
        },
      );
    }
  }

  private async handleGetAuthorizationStateResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'getAuthorizationState') {
      this.logger.warn(`Invalid command type for handleGetAuthorizationStateResponse: ${context.commandType}`);
      return;
    }
    this.logger.debug('getAuthorizationState response received', { result, context });
  }

  private async handleLogOutResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'logOut') {
      this.logger.warn(`Invalid command type for handleLogOutResponse: ${context.commandType}`);
      return;
    }
    this.logger.debug('logOut response received', { result, context });
    if (context.chatId) {
      await this.botService.bot.api.sendMessage(
        context.chatId,
        '✅ Logout realizado com sucesso! Você foi desconectado do cliente Telegram.',
      );
    }
  }

  private async handleGetMeResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'getMe') {
      this.logger.warn(`Invalid command type for handleGetMeResponse: ${context.commandType}`);
      return;
    }
    // getMe result contains user info (TelegramUserInfo)
    // This is typically used to get user info after login
    // The result is already handled in login-success event, so we just log here
    this.logger.debug('getMe response received', { result, context });
    
    const getMeContext = context as import('@felip-ai/shared-types').GetMeCommandContext;
    const metadata = getMeContext.metadata;
    if (metadata?.action === 'getUserInfoAfterLogin' && getMeContext.chatId) {
      // Could send user info to chat if needed
      // For now, login-success handler already does this
    }
  }

  private async handleSendMessageResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'sendMessage') {
      this.logger.warn(`Invalid command type for handleSendMessageResponse: ${context.commandType}`);
      return;
    }
    // sendMessage result contains the sent message info
    // Typically fire-and-forget, but we can log success
    this.logger.debug('sendMessage response received', { result, context });
    
    const sendMessageContext = context as import('@felip-ai/shared-types').SendMessageCommandContext;
    const metadata = sendMessageContext.metadata;
    if (metadata?.action === 'notifyOnSuccess' && sendMessageContext.chatId) {
      // Could send a confirmation message if needed
    }
  }

  private async handleResendAuthenticationCodeResponse(result: unknown, context: CommandContext): Promise<void> {
    if (context.commandType !== 'resendAuthenticationCode') {
      this.logger.warn(`Invalid command type for handleResendAuthenticationCodeResponse: ${context.commandType}`);
      return;
    }
    this.logger.debug('resendAuthenticationCode response received', { result, context });
  }
}

