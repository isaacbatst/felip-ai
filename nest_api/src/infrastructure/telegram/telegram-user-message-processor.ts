import { Injectable, Logger } from '@nestjs/common';
import { TelegramPurchaseHandler } from './handlers/telegram-user-purchase.handler';
import { TelegramUserClientProxyService } from '../tdlib/telegram-user-client-proxy.service';
import { QueuedMessage } from './interfaces/queued-message';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { BotStatusRepository } from '@/infrastructure/persistence/bot-status.repository';
import { TdlibUpdateNewMessage } from '../tdlib/tdlib-update.types';
import { HybridAuthorizationService } from '@/infrastructure/subscription/hybrid-authorization.service';

/**
 * Processor responsável por processar mensagens da fila
 * Single Responsibility: apenas processamento de mensagens
 * Queue-agnostic: não conhece a implementação da fila, apenas processa mensagens
 */
@Injectable()
export class TelegramUserMessageProcessor {
  private readonly logger = new Logger(TelegramUserMessageProcessor.name);
  constructor(
    private readonly purchaseHandler: TelegramPurchaseHandler,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly conversationRepository: ConversationRepository,
    private readonly botStatusRepository: BotStatusRepository,
    private readonly hybridAuthorizationService: HybridAuthorizationService,
  ) {}

  /**
   * Processes a queued message update
   * This method dispatches getUserId to check for self-messages first
   */
  async processMessage(queuedMessage: QueuedMessage): Promise<void> {
    this.logger.log('Processing message');
    const { update, userId: userIdStr } = queuedMessage;
    try {
      // Type guard to check if this is an updateNewMessage
      if (!update || typeof update !== 'object' || update._ !== 'updateNewMessage') {
        this.logger.warn('Received non-message update, ignoring...');
        return;
      }

      if (!userIdStr) {
        this.logger.warn('No userId in message update, ignoring...');
        return;
      }

      const messageUpdate = update as TdlibUpdateNewMessage;

      const message = messageUpdate?.message;
      if (!message) {
        return;
      }

      const chatId = message.chat_id;
      const senderId = message.sender_id?.user_id;

      if (!chatId) {
        this.logger.warn('Could not fetch chat ID, ignoring...');
        return;
      }

      // Get telegramUserId via HTTP to check for self-messages
      try {
        const telegramUserId = await this.telegramUserClient.getUserId(userIdStr) as number | null;
        
        // Check if this is a self-message
        if (senderId === telegramUserId) {
          this.logger.warn('Self message received, ignoring...', {
            telegramUserId,
            senderId,
            chatId,
          });
          return;
        }

        // Not a self-message, process it directly
        await this.processMessageDirectly(queuedMessage);
      } catch (error) {
        this.logger.error('Error getting telegramUserId for self-message check', { error, userId: userIdStr });
        // If we can't get userId, process anyway (better than blocking)
        await this.processMessageDirectly(queuedMessage);
      }
    } catch (error) {
      this.logger.error('Error handling new message:', { error });
    }
  }

  /**
   * Processes a message directly (after self-message check)
   * This is called from tdlib-command-response.handler.ts after verifying it's not a self-message
   */
  async processMessageDirectly(queuedMessage: QueuedMessage): Promise<void> {
    this.logger.log('Processing message directly');
    const { update, userId: userIdStr } = queuedMessage;
    try {
      // Type guard to check if this is an updateNewMessage
      if (!update || typeof update !== 'object' || update._ !== 'updateNewMessage') {
        this.logger.warn('Received non-message update, ignoring...');
        return;
      }

      if (!userIdStr) {
        this.logger.warn('No userId in message update, ignoring...');
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

      if (!chatId) {
        this.logger.warn('Could not fetch chat ID, ignoring...');
        return;
      }

      // Get loggedInUserId from repositories using telegramUserId
      // userIdStr is the telegramUserId (string) - the user interacting with the bot
      const telegramUserId = Number.parseInt(userIdStr, 10);
      if (Number.isNaN(telegramUserId)) {
        this.logger.error(`Invalid userId (not a number): ${userIdStr}`);
        return;
      }

      // Get loggedInUserId from repository
      // First try isLoggedIn which returns loggedInUserId if user is logged in
      let loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      
      // If not found, try to get session by telegramUserId (might be in progress)
      if (!loggedInUserId) {
        const session = await this.conversationRepository.getSessionByTelegramUserId(telegramUserId);
        if (session?.loggedInUserId) {
          loggedInUserId = session.loggedInUserId;
        }
      }

      if (!loggedInUserId) {
        this.logger.warn(`No loggedInUserId found for telegramUserId: ${telegramUserId}, ignoring message...`);
        return;
      }

      // Check if bot is enabled for this user (default is true if no record exists)
      const loggedInUserIdStr = loggedInUserId.toString();
      const isBotEnabled = await this.botStatusRepository.getBotStatus(loggedInUserIdStr);
      if (!isBotEnabled) {
        this.logger.warn(`Bot is disabled for loggedInUserId ${loggedInUserId}, ignoring message...`);
        return;
      }

      // Check authorization (subscription or whitelist based on AUTHORIZATION_MODE)
      const isAuthorized = await this.hybridAuthorizationService.isAuthorized(loggedInUserIdStr);
      if (!isAuthorized) {
        this.logger.warn(`User ${loggedInUserId} not authorized (no active subscription), ignoring message...`);
        return;
      }

      // Check if group is activated (only process messages from activated groups)
      // Use loggedInUserId to get active groups
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserIdStr);
      if (activeGroups === null || !activeGroups.includes(chatId)) {
        this.logger.warn(`Group ${chatId} is not activated for loggedInUserId ${loggedInUserId}, ignoring message...`);
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
        // loggedInUserIdStr is the seller's account ID - used for price table and settings lookups
        // userIdStr is the telegramUserId (string) - needed for sendMessage HTTP calls
        // Pass finalText which includes original message context if this is a reply
        // senderId is the user who sent the message (for counter offer feature)
        if (chatId && messageId !== undefined) {
          await this.purchaseHandler.handlePurchase(loggedInUserIdStr, userIdStr, chatId, messageId, text, senderId);
        }
      } else {
        logData.content = '(non-text message)';
        // Include full update for non-text messages to help debugging
        logData.rawUpdate = JSON.stringify(update, null, 2);
      }
    } catch (error) {
      this.logger.error('Error handling new message:', { error });
    }
  }
}

