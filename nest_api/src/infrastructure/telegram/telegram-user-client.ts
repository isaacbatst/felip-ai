import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { getTdjson } from 'prebuilt-tdlib';
import { AppConfigService } from 'src/config/app.config';
import type { Client } from 'tdl';
import { configure, createClient } from 'tdl';

// Configure tdl to use prebuilt-tdlib before creating any clients
configure({ tdjson: getTdjson() });

/**
 * Configuração para criar o cliente Telegram
 */
export interface TelegramUserClientConfig {
  apiId: number;
  apiHash: string;
  databaseDirectory?: string;
  filesDirectory?: string;
}

/**
 * Cliente base do Telegram User (TDLib)
 * Responsável por gerenciar o cliente e handlers básicos (erros, conexão, autorização)
 */
@Injectable()
export class TelegramUserClient implements OnModuleInit, OnModuleDestroy {
  protected client: Client | null = null;
  private isShuttingDown = false;
  private readonly config: TelegramUserClientConfig;

  constructor(private readonly appConfig: AppConfigService) {
    const apiId = this.appConfig.getTelegramApiId();
    const apiHash = this.appConfig.getTelegramApiHash();

    this.config = {
      apiId: Number.parseInt(apiId, 10),
      apiHash,
      databaseDirectory: this.appConfig.getTelegramDatabaseDirectory(),
      filesDirectory: this.appConfig.getTelegramFilesDirectory(),
    };
  }

  async onModuleInit(): Promise<void> {
    console.log('[DEBUG] Initializing Telegram User Client (POC)...');

    this.client = createClient({
      apiId: this.config.apiId,
      apiHash: this.config.apiHash,
    });

    this.setupBasicEventHandlers();

    console.log('[DEBUG] ✅ Telegram User Client initialized (waiting for login command)');
  }

  /**
   * Retorna o cliente TDLib
   */
  getClient(): Client | null {
    return this.client;
  }

  /**
   * Verifica se está em processo de shutdown
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Configura handlers básicos: erros, conexão e autorização
   */
  private setupBasicEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (error) => {
      if (this.isShuttingDown) {
        return;
      }
      if (error instanceof Error && error.message.includes('authorizationStateClosed')) {
        return;
      }
      console.error('[ERROR] Telegram User Client error:', error);
    });

    this.client.on('update', (update: unknown) => {
      if (this.isShuttingDown) {
        return;
      }
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateConnectionState') {
          const stateObj = update as { state?: { _?: string } };
          const state = stateObj?.state?._;
          if (state === 'connectionStateReady') {
            console.log('[DEBUG] ✅ Telegram User Client connected and ready');
          } else if (state === 'connectionStateConnecting') {
            console.log('[DEBUG] 🔄 Telegram User Client connecting...');
          }
        } else if (updateType === 'updateAuthorizationState') {
          const authObj = update as { authorization_state?: { _?: string } };
          const authState = authObj?.authorization_state?._;
          if (authState === 'authorizationStateClosed') {
            return;
          }
          if (authState === 'authorizationStateReady') {
            console.log('[DEBUG] ✅ Authorization ready');
          } else if (authState === 'authorizationStateWaitPhoneNumber') {
            console.log('[DEBUG] 📱 Waiting for phone number...');
          } else if (authState === 'authorizationStateWaitCode') {
            console.log('[DEBUG] 🔐 Waiting for code...');
          } else if (authState === 'authorizationStateWaitPassword') {
            console.log('[DEBUG] 🔒 Waiting for password...');
          }
        }
      }
    });
  }

  /**
   * Adiciona um handler customizado para updates
   * Permite que outros handlers registrem seus próprios listeners
   */
  onUpdate(handler: (update: unknown) => void): void {
    if (!this.client) return;
    this.client.on('update', (update: unknown) => {
      if (this.isShuttingDown) {
        return;
      }
      handler(update);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.client) {
      try {
        console.log('[DEBUG] Closing Telegram User Client...');
        await this.client.close();
        console.log('[DEBUG] Telegram User Client closed successfully');
      } catch (error) {
        if (!(error instanceof Error && error.message.includes('authorizationStateClosed'))) {
          console.error('[ERROR] Error closing Telegram User Client:', error);
        }
      }
    }
  }
}
