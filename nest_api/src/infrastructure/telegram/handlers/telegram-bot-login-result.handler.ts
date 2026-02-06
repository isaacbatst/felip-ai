import { TelegramUserInfo } from '@/infrastructure/tdlib/telegram-user-info.types';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { ConversationRepository, ConversationData } from '@/infrastructure/persistence/conversation.repository';
import { AuthCodeDeduplicationService } from '../auth-code-deduplication.service';
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
    private readonly authCodeDedup: AuthCodeDeduplicationService,
  ) {}

  async handleLoginSuccess(input: {
    telegramUserId?: number;
    loggedInUserId: number;
    chatId?: number;
    userInfo: TelegramUserInfo | null;
    error?: string;
  }): Promise<void> {
    const { telegramUserId, loggedInUserId, chatId, userInfo, error } = input;

    this.logger.log('Handling login success', { telegramUserId, loggedInUserId, chatId, hasUserInfo: !!userInfo });

    // CRITICAL: Find conversation by telegramUserId first (primary constraint - one conversation per telegram user)
    // This ensures we're updating the correct conversation for the telegram user
    // Skip telegramUserId lookup for web conversations (telegramUserId is undefined)
    let session = telegramUserId !== undefined
      ? await this.conversationRepository.getSessionByTelegramUserId(telegramUserId)
      : null;

    // If not found, try to find by loggedInUserId (fallback for edge cases and web conversations)
    if (!session) {
      this.logger.debug('Conversation not found by telegramUserId, trying loggedInUserId', { telegramUserId, loggedInUserId });
      session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
    }

    if (session) {
      this.logger.log('Conversation found for login success', { requestId: session.requestId, state: session.state, chatId: session.chatId, telegramUserId: session.telegramUserId, loggedInUserId: session.loggedInUserId });

      // Ensure we're updating the conversation for the correct telegram user (skip check for web conversations)
      if (telegramUserId !== undefined && session.telegramUserId !== undefined && session.telegramUserId !== telegramUserId) {
        this.logger.warn('Conversation telegramUserId mismatch, this should not happen', {
          sessionTelegramUserId: session.telegramUserId,
          inputTelegramUserId: telegramUserId,
          requestId: session.requestId
        });
      }
      
      // Update loggedInUserId if it changed (e.g., if user logged in as a different user)
      const actualLoggedInUserId = userInfo?.id ?? loggedInUserId;
      if (actualLoggedInUserId !== session.loggedInUserId) {
        // Update the conversation with the new loggedInUserId
        // setConversation will ensure uniqueness per telegramUserId
        const updatedConversation: ConversationData = {
          ...session,
          loggedInUserId: actualLoggedInUserId,
          state: 'completed',
          chatId: session.chatId ?? chatId, // Preserve chatId from session
        };
        await this.conversationRepository.setConversation(updatedConversation);
        this.logger.log('Conversation updated with new logged-in user ID', { telegramUserId, oldLoggedInUserId: session.loggedInUserId, newLoggedInUserId: actualLoggedInUserId });
      } else {
        // Just update the state to completed
        await this.conversationRepository.updateSessionState(session.requestId, 'completed');
        this.logger.log('Conversation marked as completed', { telegramUserId, loggedInUserId });
      }
      
      // Clear submitted code flag on success to allow future login attempts
      this.authCodeDedup.delete(session.requestId);
    } else {
      this.logger.warn('Conversation not found when handling login success', { telegramUserId, loggedInUserId, chatId });
    }

    // Use chatId from session if available, otherwise use chatId from input
    const finalChatId = session?.chatId ?? chatId;
    if (!finalChatId) {
      this.logger.debug('No chatId available to send success message (web login)', { telegramUserId, loggedInUserId, sessionChatId: session?.chatId, inputChatId: chatId });
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
    telegramUserId?: number;
    loggedInUserId: number;
    chatId?: number;
    error?: string;
    source?: 'web' | 'telegram';
  }): Promise<void> {
    const { telegramUserId, loggedInUserId, chatId, error, source } = input;

    this.logger.error('Login failed', { error, telegramUserId, loggedInUserId });

    // CRITICAL: Find conversation by telegramUserId first (primary constraint)
    // Skip telegramUserId lookup for web conversations
    let session = telegramUserId !== undefined
      ? await this.conversationRepository.getSessionByTelegramUserId(telegramUserId)
      : null;

    // If not found, try to find by loggedInUserId (fallback)
    if (!session) {
      session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
    }
    
    // Check if this is an expired code error - automatically resend code
    const isPhoneCodeExpired = error && (
      error.includes('PHONE_CODE_EXPIRED') || 
      error.includes('phone code expired') ||
      error.includes('code expired') ||
      (error.includes('expired') && error.toLowerCase().includes('code')) ||
      error.includes('compartilhado anteriormente') || // Portuguese: "shared previously"
      error.includes('shared previously')
    );
    
    if (isPhoneCodeExpired && session && session.state === 'waitingCode' && session.phoneNumber) {
      // Clear submitted code flag to allow user to enter new code
      this.authCodeDedup.delete(session.requestId);

      // Restart login process to generate a new code
      // Note: resendAuthenticationCode doesn't work for expired codes, so we restart the login process
      this.logger.log(`Restarting login to generate new code for requestId: ${session.requestId} due to expired code`);
      try {
        // Restart login with the same phone number to get a new code
        await this.client.login(loggedInUserId.toString(), session.phoneNumber, session.requestId);

        if (chatId) {
          await this.botService.bot.api.sendMessage(
            chatId,
            '⏰ O código expirou. Um novo código está sendo gerado automaticamente...\n\n' +
            'Por favor, aguarde alguns segundos e envie o novo código que você receberá no Telegram.',
          );
        }
        return;
      } catch (restartError) {
        this.logger.error(`Failed to restart login for new code: ${restartError}`, { requestId: session.requestId });
        // Fall through to show error message
      }
    }
    
    if (session) {
      // Only mark as failed if it's not an expired code (expired codes keep the session in waitingCode state)
      if (!isPhoneCodeExpired) {
        await this.conversationRepository.updateSessionState(session.requestId, 'failed');
        this.logger.log('Conversation marked as failed', { telegramUserId, loggedInUserId, requestId: session.requestId });
      }
      
      // Clear submitted code flag on failure to allow retry
      this.authCodeDedup.delete(session.requestId);
    } else {
      this.logger.warn('Conversation not found when handling login failure', { telegramUserId, loggedInUserId });
    }

    // Skip bot message for web-originated conversations (no chatId)
    if (!chatId) {
      this.logger.debug('No chatId available to send failure message (web login)', { telegramUserId, loggedInUserId });
      return;
    }

    const failureMessage = isPhoneCodeExpired
      ? '⏰ O código expirou.\n\nPor favor, inicie o processo de login novamente com /login para receber um novo código.'
      : '❌ Erro ao realizar login. Por favor, tente novamente mais tarde ou entre em contato com o suporte.';

    await this.botService.bot.api.sendMessage(chatId, failureMessage);
  }
}
