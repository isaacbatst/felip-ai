import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { TelegramPurchaseHandler } from './handlers/telegram-purchase.handler';
import { TelegramUserClient } from './telegram-user-client';
import { Queue } from './interfaces/queue.interface';
import { MessageQueueProcessor } from './message-queue-processor.service';

/**
 * Message data structure for queue processing
 * Contains the full update object to be processed
 */
export interface QueuedMessage {
  update: unknown;
}

/**
 * Handler responsável por processar mensagens recebidas do Telegram User Client
 * Single Responsibility: apenas processamento de mensagens recebidas
 */
@Injectable()
export class TelegramUserMessageHandler implements OnModuleInit, OnModuleDestroy {
  private queueProcessor: MessageQueueProcessor<QueuedMessage>

  constructor(
    private readonly client: TelegramUserClient,
    private readonly messageQueue: Queue<QueuedMessage>,
    private readonly purchaseHandler: TelegramPurchaseHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    this.setupMessageHandlers();
    this.setupQueueProcessor();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queueProcessor) {
      await this.queueProcessor.stop();
    }
  }

  /**
   * Sets up the queue processor to process messages synchronously
   */
  private setupQueueProcessor(): void {
    const processor = async (item: QueuedMessage): Promise<void> => {
      await this.processMessage(item);
    };
    this.queueProcessor = new MessageQueueProcessor(this.messageQueue, processor);
    this.queueProcessor.start();
  }

  /**
   * Configura handlers para mensagens recebidas
   */
  private setupMessageHandlers(): void {
    this.client.onUpdate((update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateNewMessage') {
          this.handleNewMessage(update);
        }
      }
    });
  }

  private handleNewMessage(update: unknown): void {
    // Enqueue the full update for processing through the processor
    if (this.queueProcessor) {
      this.queueProcessor.enqueue({ update }).catch((error: unknown) => {
        console.error('[ERROR] Error enqueueing message:', error);
      });
    }
  }

  /**
   * Processes a queued message update
   * This method is called by the queue processor synchronously
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

      console.log('[MESSAGE] New message received:', JSON.stringify(logData, null, 2));
    } catch (error) {
      console.error('[ERROR] Error handling new message:', error);
    }
  }
}
