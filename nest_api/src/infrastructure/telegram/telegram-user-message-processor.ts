import { Injectable } from '@nestjs/common';
import { TelegramPurchaseHandler } from './handlers/telegram-purchase.handler';
import { TelegramUserClient } from './telegram-user-client';
import { QueuedMessage } from './telegram-user-message-handler';

/**
 * Processor responsável por processar mensagens da fila
 * Single Responsibility: apenas processamento de mensagens
 * Queue-agnostic: não conhece a implementação da fila, apenas processa mensagens
 */
@Injectable()
export class TelegramUserMessageProcessor {
  constructor(
    private readonly client: TelegramUserClient,
    private readonly purchaseHandler: TelegramPurchaseHandler,
  ) {}

  /**
   * Processes a queued message update
   */
  async processMessage(queuedMessage: QueuedMessage): Promise<void> {
    const { update } = queuedMessage;
    try {
      const messageUpdate = update as {
        message?: {
          id?: number;
          chat_id?: number;
          content?: {
            _?: string;
            text?: {
              _?: string;
              text?: string;
            };
          };
          sender_id?: {
            _?: string;
            user_id?: number;
          };
          date?: number;
        };
      };

      const message = messageUpdate?.message;
      if (!message) {
        return;
      }

      const messageId = message.id;
      const chatId = message.chat_id;
      const senderId = message.sender_id?.user_id;
      const date = message.date;
      const content = message.content;

      // Ignore self messages (messages sent by the bot itself)
      const botUserId = await this.client.getUserId();
      if (botUserId !== null && senderId === botUserId) {
        console.log('[MESSAGE] Self message received, ignoring...');
        return;
      }

      // Extract text content
      let text = '';
      let contentType = 'unknown';
      if (content?._ === 'messageText' && content?.text?._ === 'formattedText') {
        text = content.text.text || '';
        contentType = 'text';
      } else if (content?._) {
        contentType = content._;
      }

      // Log the message
      const logData: Record<string, unknown> = {
        messageId,
        chatId,
        senderId,
        date: date ? new Date(date * 1000).toISOString() : undefined,
        contentType,
      };

      if (text) {
        logData.text = text;
        // Handle text message with purchase handler
        if (chatId && messageId !== undefined) {
          console.log('disable purchase handler', chatId, messageId, text);
          // await this.purchaseHandler.handlePurchase(chatId, messageId, text);
        }
      } else {
        logData.content = '(non-text message)';
        // Include full update for non-text messages to help debugging
        logData.rawUpdate = JSON.stringify(update, null, 2);
      }

      console.log('[MESSAGE] New message received:', JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('[ERROR] Error handling new message:', error);
    }
  }
}

