import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'grammy';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { TelegramAuthCodeHandler } from './telegram-bot-auth-code.handler';
import { TelegramPhoneNumberHandler } from './telegram-bot-phone-number.handler';

/**
 * Handler responsável por processar mensagens de texto do Telegram Bot
 * Single Responsibility: apenas processamento de mensagens do bot
 * Composition: usa handlers especializados para processar diferentes tipos de mensagens
 */
@Injectable()
export class TelegramBotMessageHandler {
  private readonly logger = new Logger(TelegramBotMessageHandler.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly phoneNumberHandler: TelegramPhoneNumberHandler,
    private readonly authCodeHandler: TelegramAuthCodeHandler,
  ) {}

  async handleMessage(msg: Context['update']['message']): Promise<void> {
    try {
      this.logger.log('Handling message received');
      const text = msg?.text;
      const userId = msg?.from?.id;
      this.logger.log('Message', msg);

      if (!text || !userId || !msg.chat?.id) {
        this.logger.warn('No text or user ID found');
        return;
      }

      // Check session state
      const session = await this.conversationRepository.getSessionByTelegramUserId(userId);
      if (session) {
        if (session.state === 'waitingCode' || session.state === 'waitingPassword') {
          this.logger.log('User is waiting for auth code');
          await this.authCodeHandler.handleAuthCodeInput({
            chatId: msg.chat.id,
            authCode: text,
            userId,
          });
          return;
        }

        if (session.state === 'waitingPhone') {
          this.logger.log('User is waiting for phone number');
          await this.phoneNumberHandler.handlePhoneNumberInput({
            chatId: msg.chat?.id,
            phoneNumber: text,
            userId,
          });
          return;
        }
      }

      this.logger.warn('No handler found for message');
    } catch (error) {
      this.logger.error('Error handling try catch', error);
    }
  }
}
