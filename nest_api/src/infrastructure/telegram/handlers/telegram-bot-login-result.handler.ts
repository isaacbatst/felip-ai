import { TelegramUserInfo } from '@/infrastructure/tdlib/telegram-user-info.types';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { ConversationRepository, ConversationData } from '@/infrastructure/persistence/conversation.repository';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Handler responsável por processar resultados de login (sucesso ou falha)
 * Single Responsibility: apenas processamento de resultados de login
 * Composition: usa services para limpar estado e enviar mensagens
 */
@Injectable()
export class TelegramBotLoginResultHandler {
  private readonly logger = new Logger(TelegramBotLoginResultHandler.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly botService: TelegramBotService,
    private readonly client: TelegramUserClientProxyService,
  ) {}

  async handleLoginSuccess(input: {
    telegramUserId: number;
    loggedInUserId: number;
    chatId: number;
    userInfo: TelegramUserInfo | null;
    error?: string;
  }): Promise<void> {
    const { telegramUserId, loggedInUserId, chatId, userInfo, error } = input;

    this.logger.log('Handling login success', { telegramUserId, loggedInUserId, chatId, hasUserInfo: !!userInfo });

    // Update session with logged-in user ID and mark as completed
    // First try to find session by the loggedInUserId from input (which might be the initial telegramUserId)
    let session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
    
    // If not found, try to find by telegramUserId (in case loggedInUserId changed)
    if (!session) {
      this.logger.debug('Session not found by loggedInUserId, trying telegramUserId', { loggedInUserId, telegramUserId });
      session = await this.conversationRepository.getSessionByTelegramUserId(telegramUserId);
    }
    
    if (session) {
      this.logger.log('Session found for login success', { requestId: session.requestId, state: session.state, chatId: session.chatId });
      // Update loggedInUserId if it changed (e.g., if user logged in as a different user)
      const actualLoggedInUserId = userInfo?.id ?? loggedInUserId;
      if (actualLoggedInUserId !== session.loggedInUserId) {
        // Need to update the session with the new loggedInUserId
        // Delete old session and create new one with updated loggedInUserId
        await this.conversationRepository.deleteSession(session.requestId);
        const updatedConversation: ConversationData = {
          ...session,
          loggedInUserId: actualLoggedInUserId,
          state: 'completed',
        };
        await this.conversationRepository.setConversation(updatedConversation);
        this.logger.log('Session updated with new logged-in user ID', { telegramUserId, oldLoggedInUserId: session.loggedInUserId, newLoggedInUserId: actualLoggedInUserId });
      } else {
        await this.conversationRepository.updateSessionState(session.requestId, 'completed');
        this.logger.log('Session marked as completed', { telegramUserId, loggedInUserId });
      }
    } else {
      this.logger.warn('Session not found when handling login success', { telegramUserId, loggedInUserId, chatId });
    }

    // Use chatId from session if available, otherwise use chatId from input
    const finalChatId = session?.chatId ?? chatId;
    if (!finalChatId) {
      this.logger.error('No chatId available to send success message', { telegramUserId, loggedInUserId, sessionChatId: session?.chatId, inputChatId: chatId });
      return;
    }

    let finalUserInfo = userInfo;
    
    // If userInfo is null or there was an error getting it, try to fetch it
    if (!finalUserInfo && !error) {
      try {
        finalUserInfo = await this.client.getMe(loggedInUserId.toString()) as TelegramUserInfo | null;
      } catch (err) {
        this.logger.error('Failed to get user info after login', { error: err, telegramUserId, loggedInUserId });
      }
    }
    
    // Format and send success message
    try {
      if (finalUserInfo) {
        const successMessage =
          '✅ Login realizado com sucesso!\n\n' +
          `📋 Informações da conta:\n` +
          `• ID: ${finalUserInfo.id}\n` +
          (finalUserInfo.first_name ? `• Nome: ${finalUserInfo.first_name}` : '') +
          (finalUserInfo.last_name ? ` ${finalUserInfo.last_name}` : '') +
          (finalUserInfo.username ? `\n• Username: @${finalUserInfo.username}` : '') +
          (finalUserInfo.phone_number ? `\n• Telefone: ${finalUserInfo.phone_number}` : '');

        await this.botService.bot.api.sendMessage(finalChatId, successMessage);
        this.logger.log('Success message sent', { chatId: finalChatId, telegramUserId, loggedInUserId });
      } else {
        // Fallback message if we couldn't get user info
        await this.botService.bot.api.sendMessage(
          finalChatId,
          '✅ Login realizado com sucesso!\n\n' +
            (error ? `⚠️ Aviso: ${error}` : ''),
        );
        this.logger.log('Success message sent (fallback)', { chatId: finalChatId, telegramUserId, loggedInUserId });
      }
    } catch (err) {
      this.logger.error('Failed to send success message', { error: err, chatId: finalChatId, telegramUserId, loggedInUserId });
    }
  }

  async handleLoginFailure(input: {
    telegramUserId: number;
    loggedInUserId: number;
    chatId: number;
    error?: string;
  }): Promise<void> {
    const { telegramUserId, loggedInUserId, chatId, error } = input;

    this.logger.error('Login failed', { error, telegramUserId, loggedInUserId });
    
    // Update session state to failed
    const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
    if (session) {
      await this.conversationRepository.updateSessionState(session.requestId, 'failed');
    }

    const failureMessage =
      '❌ Erro ao realizar login. Por favor, tente novamente mais tarde ou entre em contato com o suporte.';

    await this.botService.bot.api.sendMessage(chatId, failureMessage);
  }
}
