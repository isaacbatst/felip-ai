import { Queue } from 'bullmq';
import { TelegramUserClient } from './telegram-user-client';

/**
 * Handler responsável por receber eventos do Telegram Client e enviar para a fila BullMQ
 */
export class UpdateHandler {
  private updatesQueue: Queue;
  private readonly userId?: string;

  constructor(
    private readonly client: TelegramUserClient,
    redisConnection: { host: string; port: number; password?: string },
    queueName: string = 'tdlib-updates',
    userId?: string,
  ) {
    this.updatesQueue = new Queue(queueName, {
      connection: redisConnection,
    });
    this.userId = userId;
  }

  /**
   * Configura handlers para mensagens recebidas e envia para a fila BullMQ
   */
  setupHandlers(): void {
    this.client.onUpdate((update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateNewMessage') {
          this.updatesQueue
            .add('new-message', { update, userId: this.userId })
            .catch((error: unknown) => {
              console.error('[ERROR] Error enqueueing message to BullMQ:', error);
            });
        } else if (updateType === 'updateAuthorizationState') {
          // Send authorization state updates
          this.updatesQueue
            .add('authorization-state', { update, userId: this.userId })
            .catch((error: unknown) => {
              console.error('[ERROR] Error enqueueing authorization state update:', error);
            });
        }
      }
    });
  }

  async close(): Promise<void> {
    await this.updatesQueue.close();
  }
}

