import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { type RunnerHandle, run } from '@grammyjs/runner';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Context } from 'grammy';
import { TelegramBotRegistrationHandler } from './handlers/telegram-bot-registration.handler';

/**
 * Service responsável por gerenciar o bot do Telegram
 * Single Responsibility: apenas gerenciamento do bot
 * Composition: usa handlers para processar mensagens e comandos
 */
@Injectable()
export class TelegramBotController implements OnModuleInit, OnModuleDestroy {
  private runner: RunnerHandle | null = null;
  private readonly logger = new Logger(TelegramBotController.name);
  constructor(
    private readonly registrationHandler: TelegramBotRegistrationHandler,
    private readonly botService: TelegramBotService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting Telegram bot...');
    this.setupHandlers();
    this.runner = run(this.botService.bot, {
      sink: {
        concurrency: 5,
        timeout: {
          handler: (update, task) => {
            this.logger.error('Bot timeout', { update, task });
          },
          milliseconds: 30000,
        },
      },
    });
    this.logger.log('Telegram bot started successfully');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.runner?.isRunning()) {
      this.logger.log('Stopping Telegram bot runner...');
      await this.runner.stop();
      this.logger.log('Telegram bot runner stopped successfully');
    }
  }

  private setupHandlers(): void {
    // Register /start command handler (registration flow)
    this.botService.bot.command('start', async (ctx: Context) => {
      await this.registrationHandler.handleStart(ctx);
    });

    // Error handler
    this.botService.bot.catch((error) => {
      this.logger.error('Bot error', { error });
    });
  }
}
