import { Injectable } from '@nestjs/common';
import { TelegramMessageSender } from './interfaces/telegram-message-sender.interface';
import { TelegramUserClient } from './telegram-user-client';

/**
 * Sender responsável por enviar mensagens através do Telegram User Client
 * Single Responsibility: apenas envio de mensagens
 */
@Injectable()
export class TelegramUserMessageSender extends TelegramMessageSender {
  constructor(private readonly client: TelegramUserClient) {
    super();
  }

  async sendMessage(
    chatId: number,
    text: string,
    replyToMessageId?: number,
  ): Promise<unknown> {
    return this.client.sendMessage(chatId, text, replyToMessageId);
  }
}

