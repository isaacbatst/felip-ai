import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { type RunnerHandle, run, sequentialize } from '@grammyjs/runner';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Context } from 'grammy';
import { TelegramBotQueueProcessorRabbitMQ } from '../queue/rabbitmq/telegram-bot-queue-processor-rabbitmq.service';
import { TelegramCommandHandler } from './handlers/telegram-bot-command.handler';

/**
 * Service responsável por gerenciar o bot do Telegram
 * Single Responsibility: apenas gerenciamento do bot
 * Composition: usa handlers para processar mensagens e comandos
 * Uses QueueProcessor service ready via DI - no setup needed
 */
@Injectable()
export class TelegramBotController implements OnModuleInit, OnModuleDestroy {
  private runner: RunnerHandle | null = null;
  private readonly logger = new Logger(TelegramBotController.name);
  constructor(
    private readonly commandHandler: TelegramCommandHandler,
    private readonly messageQueueProcessor: TelegramBotQueueProcessorRabbitMQ,
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
    // Register /start command handler
    this.botService.bot.command('start', async (ctx: Context) => {
      await this.commandHandler.handleStart(ctx);
    });

    // Register /login command handler
    this.botService.bot.command('login', async (ctx: Context) => {
      await this.commandHandler.handleLogin(ctx);
    });

    // Register /grupos command handler
    this.botService.bot.command('grupos', async (ctx: Context) => {
      await this.commandHandler.handleGrupos(ctx);
    });

    // Register /logout command handler
    this.botService.bot.command('logout', async (ctx: Context) => {
      await this.commandHandler.handleLogout(ctx);
    });

    // Register /ativar command handler
    this.botService.bot.command('ativar', async (ctx: Context) => {
      await this.commandHandler.handleAtivar(ctx);
    });

    // Register /desativar command handler
    this.botService.bot.command('desativar', async (ctx: Context) => {
      await this.commandHandler.handleDesativar(ctx);
    });

    // Register /gruposativos command handler
    this.botService.bot.command('gruposativos', async (ctx: Context) => {
      await this.commandHandler.handleGruposAtivos(ctx);
    });

    // Register /on command handler
    this.botService.bot.command('on', async (ctx: Context) => {
      await this.commandHandler.handleOn(ctx);
    });

    // Register /off command handler
    this.botService.bot.command('off', async (ctx: Context) => {
      await this.commandHandler.handleOff(ctx);
    });

    // Register message:text handler with sequentialization (only for login flow now)
    this.botService.bot.on(
      'message:text',
      sequentialize((ctx) => {
        const chat = ctx.chat?.id.toString();
        const user = ctx.from?.id.toString();
        return [chat, user].filter((con) => con !== undefined);
      }),
      async (ctx: Context) => {
        this.logger.log('Enqueuing message', ctx.update.message?.text ?? 'No text');
        this.messageQueueProcessor.enqueue(ctx.update.message).catch((error: unknown) => {
          this.logger.error('Error enqueueing message', { error });
        });
      },
    );

    // Error handler
    this.botService.bot.catch((error) => {
      this.logger.error('Bot error', { error });
    });
  }
}
