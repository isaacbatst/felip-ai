import { type RunnerHandle, run, sequentialize } from '@grammyjs/runner';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Bot, type Context } from 'grammy';
import { AppConfigService } from 'src/config/app.config';
import { TelegramCommandHandler } from './handlers/telegram-command.handler';
import { TelegramMessageHandler } from './handlers/telegram-message.handler';

/**
 * Service responsável por gerenciar o bot do Telegram
 * Single Responsibility: apenas gerenciamento do bot
 * Composition: usa handlers para processar mensagens e comandos
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private bot: Bot;
  private runner: RunnerHandle | null = null;

  constructor(
    private readonly messageHandler: TelegramMessageHandler,
    private readonly commandHandler: TelegramCommandHandler,
    private readonly config: AppConfigService,
  ) {
    const token = this.config.getTelegramBotToken();
    this.bot = new Bot(token);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Register /start command handler
    this.bot.command('start', async (ctx: Context) => {
      await this.commandHandler.handleStart(ctx);
    });

    // Register /login command handler
    this.bot.command('login', async (ctx: Context) => {
      await this.commandHandler.handleLogin(ctx);
    });

    // Register message:text handler with sequentialization (only for login flow now)
    this.bot.on(
      'message:text',
      sequentialize((ctx) => {
        const chat = ctx.chat?.id.toString();
        const user = ctx.from?.id.toString();
        return [chat, user].filter((con) => con !== undefined);
      }),
      async (ctx: Context) => {
        await this.messageHandler.handleMessage(ctx);
      },
    );

    // Error handler
    this.bot.catch((error) => {
      console.error('[ERROR] Bot error:', error);
    });
  }

  async onModuleInit(): Promise<void> {
    console.log('[DEBUG] Starting Telegram bot...');
    this.runner = run(this.bot, {
      sink: {
        concurrency: 5,
        timeout: {
          handler: (update, task) => {
            console.error('[ERROR] Bot timeout:', update, task);
          },
          milliseconds: 30000,
        },
      },
    });
    console.log('[DEBUG] Telegram bot started successfully');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.runner?.isRunning()) {
      console.log('[DEBUG] Stopping Telegram bot runner...');
      await this.runner.stop();
      console.log('[DEBUG] Telegram bot runner stopped successfully');
    }
  }
}
