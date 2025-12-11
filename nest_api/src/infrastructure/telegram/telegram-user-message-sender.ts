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
    const clientInstance = this.client.getClient();
    if (!clientInstance) {
      throw new Error('Client not initialized');
    }

    const messageParams: Record<string, unknown> = {
      _: 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: {
          _: 'formattedText',
          text,
        },
      },
    };

    if (replyToMessageId !== undefined) {
      messageParams.reply_to_message_id = replyToMessageId;
    }

    return clientInstance.invoke(messageParams as Parameters<typeof clientInstance.invoke>[0]);
  }
}

