import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConversationStateService } from '../conversation-state.service';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';

/**
 * Handler responsável por processar entrada de número de telefone durante o fluxo de login
 * Single Responsibility: apenas processamento de número de telefone
 * Composition: usa services para validar e realizar login
 */
@Injectable()
export class TelegramPhoneNumberHandler {
  private readonly logger = new Logger(TelegramPhoneNumberHandler.name);

  constructor(
    private readonly conversationState: ConversationStateService,
    private readonly client: TelegramUserClientProxyService,
    private readonly phoneWhitelist: PhoneWhitelistService,
    private readonly botService: TelegramBotService,
  ) {}

  async handlePhoneNumberInput(input: {
    chatId: number;
    phoneNumber: string;
    userId: number;
  }): Promise<void> {
    const { chatId, phoneNumber, userId } = input;
    // Validate phone number format (should start with +)
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone.startsWith('+')) {
      this.logger.warn('Phone number format invalid', { phoneNumber });
      await this.botService.bot.api.sendMessage(
        chatId,
        '❌ Formato inválido. Por favor, envie o número no formato internacional começando com +.\n\n' +
          'Exemplo: +5511999999999',
      );
      return;
    }

    // Check if phone number is in whitelist
    if (!this.phoneWhitelist.isAllowed(normalizedPhone)) {
      this.logger.warn('Phone number not allowed, clearing state', { phoneNumber });
      await this.conversationState.clearState(userId);
      await this.botService.bot.api.sendMessage(
        chatId,
        '❌ Seu número não está autorizado.\n\n' +
          'Por favor, entre em contato com o suporte para habilitar seu número.',
      );
      return;
    }

    // Inform user that login is starting
    await this.botService.bot.api.sendMessage(
      chatId,
      '🔄 Iniciando processo de login...',
    );

    // Perform login (dispatched to queue, processed separately)
    // Auth code request will be handled by TdlibUpdatesWorkerService when tdlib dispatches auth-code-request event
    // Success/failure will be handled by TelegramBotLoginResultHandler via tdlib-updates queue
    this.logger.log('Dispatching login to queue', { phoneNumber });
    await this.client.login(normalizedPhone, userId, chatId);
  }
}
