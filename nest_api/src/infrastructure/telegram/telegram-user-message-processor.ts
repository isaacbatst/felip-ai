import { Injectable, Logger } from '@nestjs/common';
import { TelegramPurchaseHandler } from './handlers/telegram-user-purchase.handler';
import { TelegramUserClientProxyService } from '../tdlib/telegram-user-client-proxy.service';
import { QueuedMessage } from './interfaces/queued-message';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { TdlibUpdateNewMessage } from '../tdlib/tdlib-update.types';

/**
 * Processor responsável por processar mensagens da fila
 * Single Responsibility: apenas processamento de mensagens
 * Queue-agnostic: não conhece a implementação da fila, apenas processa mensagens
 */
@Injectable()
export class TelegramUserMessageProcessor {
  private readonly logger = new Logger(TelegramUserMessageProcessor.name);
  constructor(
    private readonly client: TelegramUserClientProxyService,
    private readonly purchaseHandler: TelegramPurchaseHandler,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
  ) {}

  /**
   * Processes a queued message update
   */
  async processMessage(queuedMessage: QueuedMessage): Promise<void> {
    this.logger.log('Processing message', { queuedMessage });
    const { update } = queuedMessage;
    try {
      // Type guard to check if this is an updateNewMessage
      if (!update || typeof update !== 'object' || update._ !== 'updateNewMessage') {
        this.logger.warn('Received non-message update, ignoring...');
        return;
      }

      const messageUpdate = update as TdlibUpdateNewMessage;

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
      const userId = await this.client.getUserId();
      if(!userId) {
        this.logger.warn('Could not fetch user ID, ignoring...');
        return;
      }
      if(!chatId) {
        this.logger.warn('Could not fetch chat ID, ignoring...');
        return;
      }
      if (senderId === userId) {
        this.logger.warn('Self message received, ignoring...');
        return;
      }

      // Check if group is activated (only process messages from activated groups)
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId.toString());
      this.logger.log('Active groups:', { activeGroups, userId });
      if (activeGroups === null || !activeGroups.includes(chatId)) {
        this.logger.warn(`Group ${chatId} is not activated, ignoring message...`);
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
          await this.purchaseHandler.handlePurchase(chatId, messageId, text);
        }
      } else {
        logData.content = '(non-text message)';
        // Include full update for non-text messages to help debugging
        logData.rawUpdate = JSON.stringify(update, null, 2);
      }

      this.logger.log('New message received:', { logData });
    } catch (error) {
      this.logger.error('Error handling new message:', { error });
    }
  }
}

