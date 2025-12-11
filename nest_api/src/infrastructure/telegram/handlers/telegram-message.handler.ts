import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { ConversationState, ConversationStateService } from '../conversation-state.service';
import { TelegramPhoneNumberHandler } from './telegram-phone-number.handler';

/**
 * Handler responsável por processar mensagens de texto do Telegram Bot
 * Single Responsibility: apenas processamento de mensagens do bot
 * Composition: usa handlers especializados para processar diferentes tipos de mensagens
 */
@Injectable()
export class TelegramMessageHandler {
  constructor(
    private readonly conversationState: ConversationStateService,
    private readonly phoneNumberHandler: TelegramPhoneNumberHandler,
  ) {}

  async handleMessage(ctx: Context): Promise<void> {
    const text = ctx.message?.text;
    const userId = ctx.from?.id;

    if (!text || !userId) {
      return;
    }

    // Check if user is in login flow
    if (this.conversationState.isInState(userId, ConversationState.WAITING_PHONE_NUMBER)) {
      await this.phoneNumberHandler.handlePhoneNumberInput(ctx, text, userId);
      return;
    }

    // Bot no longer handles purchase requests - they are handled by the Telegram User Client
  }
}

