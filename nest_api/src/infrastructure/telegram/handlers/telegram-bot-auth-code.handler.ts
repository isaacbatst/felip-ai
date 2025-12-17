import { Injectable } from '@nestjs/common';
import { ConversationStateService } from '../conversation-state.service';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';

/**
 * Handler responsável por processar entrada de código de autenticação durante o fluxo de login
 * Single Responsibility: apenas processamento de código de autenticação
 * Composition: usa services para validar e fornecer código
 */
@Injectable()
export class TelegramAuthCodeHandler {
  constructor(
    private readonly conversationState: ConversationStateService,
    private readonly botService: TelegramBotService,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly conversationRepository: ConversationRepository,
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

    // Check if there's a pending auth code request
    if (!(await this.conversationState.hasPendingAuthCodeRequestId(userId))) {
      await this.botService.bot.api.sendMessage(chatId, '❌ Não há uma solicitação de código de autenticação pendente.\n\n' +
          'Por favor, inicie o processo de login novamente.',
      );
      await this.conversationState.clearState(userId);
      return;
    }

    // Get the requestId associated with this userId
    const requestId = await this.conversationState.getPendingAuthCodeRequestId(userId);
    if (!requestId) {
      await this.botService.bot.api.sendMessage(chatId, '❌ Erro ao processar código. Por favor, tente novamente.');
      await this.conversationState.clearState(userId);
      return;
    }

    // Get session data from Redis to include in payload
    const session = await this.conversationRepository.getLoginSession(requestId);
    if (!session) {
      await this.botService.bot.api.sendMessage(chatId, '❌ Sessão de login não encontrada. Por favor, inicie o processo novamente.');
      await this.conversationState.clearState(userId);
      return;
    }

    try {
      // Send auth code to tdlib worker via queue with session data
      await this.telegramUserClient.provideAuthCode(requestId, normalizedCode, {
        userId: session.userId,
        chatId: session.chatId,
        phoneNumber: session.phoneNumber,
        state: session.state,
      });
      
      // Clear the pending auth code mapping
      await this.conversationState.clearPendingAuthCodeRequestId(userId);
      
      await this.botService.bot.api.sendMessage(chatId, '✅ Código recebido! Processando login...');
    } catch (error) {
      console.error(`[ERROR] Error providing auth code for userId ${userId}:`, error);
      await this.botService.bot.api.sendMessage(chatId, '❌ Erro ao processar código. Por favor, tente novamente.');
      await this.conversationState.clearState(userId);
    }
  }
}

