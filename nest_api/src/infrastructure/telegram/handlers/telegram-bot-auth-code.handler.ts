import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { AuthCodeDeduplicationService } from '../auth-code-deduplication.service';

/**
 * Handler responsável por processar entrada de código de autenticação durante o fluxo de login
 * Single Responsibility: apenas processamento de código de autenticação
 * Composition: usa services para validar e fornecer código
 */
@Injectable()
export class TelegramAuthCodeHandler {
  private readonly logger = new Logger(TelegramAuthCodeHandler.name);

  constructor(
    private readonly botService: TelegramBotService,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly conversationRepository: ConversationRepository,
    private readonly authCodeDedup: AuthCodeDeduplicationService,
  ) {}

  async handleAuthCodeInput(input: {
    chatId: number;
    authCode: string;
    userId: number;
  }): Promise<void> {
    const { chatId, authCode, userId } = input;
    // Normalize the code (remove spaces, dashes, etc.)
    const normalizedCode = authCode.trim().replace(/[\s-]/g, '');

    // Validate code format (should be numeric, typically 5 digits)
    if (!/^\d+$/.test(normalizedCode)) {
      await this.botService.bot.api.sendMessage(chatId, '❌ Formato inválido. Por favor, envie apenas números.\n\n' +
          'Exemplo: 12345',
      );
      return;
    }

    // Get session for this user
    const session = await this.conversationRepository.getSessionByTelegramUserId(userId);
    if (!session) {
      await this.botService.bot.api.sendMessage(chatId, '❌ Não há uma sessão de login ativa.\n\n' +
          'Por favor, inicie o processo de login novamente.',
      );
      return;
    }

    // Check if session is in the right state
    if (session.state !== 'waitingCode' && session.state !== 'waitingPassword') {
      await this.botService.bot.api.sendMessage(chatId, '❌ Não há uma solicitação de código de autenticação pendente.\n\n' +
          'Por favor, inicie o processo de login novamente.',
      );
      await this.conversationRepository.deleteSession(session.requestId);
      return;
    }

    const requestId = session.requestId;

    // CRITICAL: Prevent duplicate code submissions using atomic in-memory operation
    // This prevents race conditions where two requests could both pass the check
    const wasSet = this.authCodeDedup.setIfNotExists(requestId, normalizedCode);
    
    if (!wasSet) {
      // Code already submitted - prevent duplicate
      this.logger.warn(`Duplicate auth code submission prevented for requestId: ${requestId}`);
      await this.botService.bot.api.sendMessage(
        chatId,
        '⏳ Código já foi processado. Aguarde a resposta do login...\n\n' +
        'Se o código não funcionou, inicie o processo novamente com /login.',
      );
      return;
    }

    try {
      // Code successfully marked as submitted (atomic operation completed)
      // Now proceed to send the code to TDLib

      // Send auth code to tdlib worker via queue with session data
      // session.botUserId is botUserId (string) - identifies which worker
      // session.telegramUserId is telegramUserId (number) - the user interacting with the bot
      if (!session.phoneNumber) {
        // Clear the submitted code flag if phone number is missing
        this.authCodeDedup.delete(requestId);
        await this.botService.bot.api.sendMessage(chatId, '❌ Erro: número de telefone não encontrado na sessão.');
        return;
      }
      
      await this.telegramUserClient.provideAuthCode(
        session.loggedInUserId.toString(),
        requestId,
        normalizedCode,
        {
          userId: session.telegramUserId,
          chatId: session.chatId,
          phoneNumber: session.phoneNumber,
          state: session.state,
        },
      );
      
      await this.botService.bot.api.sendMessage(chatId, '✅ Código recebido! Processando login...');
    } catch (error) {
      // Clear the submitted code flag on error to allow retry
      this.authCodeDedup.delete(requestId);
      
      this.logger.error(`[ERROR] Error providing auth code for userId ${userId}:`, error);
      await this.botService.bot.api.sendMessage(chatId, '❌ Erro ao processar código. Por favor, tente novamente.');
      if (session) {
        await this.conversationRepository.deleteSession(session.requestId);
      }
    }
  }
}

