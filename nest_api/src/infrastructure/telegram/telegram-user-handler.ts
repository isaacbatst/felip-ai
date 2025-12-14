import { Injectable, type OnModuleInit } from '@nestjs/common';
import { TelegramUserClient } from './telegram-user-client';
import { TelegramQueueProcessor } from './telegram-queue-processor.service';

/**
 * Dispatcher responsável por receber eventos do Telegram Client e despachar para a fila
 * Single Responsibility: apenas recepção de eventos e despacho para fila
 * Uses QueueProcessor service ready via DI - no setup needed
 */
@Injectable()
export class TelegramUserHandler implements OnModuleInit {
  constructor(
    private readonly client: TelegramUserClient,
    private readonly queueProcessor: TelegramQueueProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    this.setupHandlers();
  }

  /**
   * Configura handlers para mensagens recebidas e despacha para a fila
   */
  private setupHandlers(): void {
    this.client.onUpdate((update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateNewMessage') {
          this.queueProcessor.enqueue({ update }).catch((error: unknown) => {
            console.error('[ERROR] Error enqueueing message:', error);
          });
        }
      }
    });
  }
}
