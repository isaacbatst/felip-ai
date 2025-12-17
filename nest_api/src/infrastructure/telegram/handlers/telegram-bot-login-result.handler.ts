import { TelegramUserInfo } from '@/infrastructure/tdlib/telegram-user-info.types';
import { ConversationStateService } from '../conversation-state.service';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
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
    private readonly conversationState: ConversationStateService,
    private readonly botService: TelegramBotService,
    private readonly client: TelegramUserClientProxyService,
  ) {}

  async handleLoginSuccess(input: {
    userId: number;
    chatId: number;
    userInfo: TelegramUserInfo | null;
    error?: string;
  }): Promise<void> {
    const { userId, chatId, userInfo, error } = input;

    // Clear conversation state after successful login
    this.logger.log('Clearing conversation state after successful login', { userId });
    await this.conversationState.clearState(userId);

    let finalUserInfo = userInfo;
    
    // If userInfo is null or there was an error getting it, try to fetch it
    if (!finalUserInfo && !error) {
      try {
        finalUserInfo = await this.client.getMe();
      } catch (err) {
        this.logger.error('Failed to get user info after login', { error: err, userId });
      }
    }
    
    // Format and send success message
    if (finalUserInfo) {
      const successMessage =
        '✅ Login realizado com sucesso!\n\n' +
        `📋 Informações da conta:\n` +
        `• ID: ${finalUserInfo.id}\n` +
        (finalUserInfo.first_name ? `• Nome: ${finalUserInfo.first_name}` : '') +
        (finalUserInfo.last_name ? ` ${finalUserInfo.last_name}` : '') +
        (finalUserInfo.username ? `\n• Username: @${finalUserInfo.username}` : '') +
        (finalUserInfo.phone_number ? `\n• Telefone: ${finalUserInfo.phone_number}` : '');

      await this.botService.bot.api.sendMessage(chatId, successMessage);
    } else {
      // Fallback message if we couldn't get user info
      await this.botService.bot.api.sendMessage(
        chatId,
        '✅ Login realizado com sucesso!\n\n' +
          (error ? `⚠️ Aviso: ${error}` : ''),
      );
    }
  }

  async handleLoginFailure(input: {
    userId: number;
    chatId: number;
    error?: string;
  }): Promise<void> {
    const { userId, chatId, error } = input;

    this.logger.error('Login failed', { error, userId });
    
    // Clear conversation state on error
    await this.conversationState.clearState(userId);

    const failureMessage =
      '❌ Erro ao realizar login. Por favor, tente novamente mais tarde ou entre em contato com o suporte.';

    await this.botService.bot.api.sendMessage(chatId, failureMessage);
  }
}
