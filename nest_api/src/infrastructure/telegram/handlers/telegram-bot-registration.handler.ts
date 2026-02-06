import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'grammy';
import { UserRepository } from '@/infrastructure/persistence/user.repository';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { AppConfigService } from '@/config/app.config';

@Injectable()
export class TelegramBotRegistrationHandler {
  private readonly logger = new Logger(TelegramBotRegistrationHandler.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly phoneWhitelistService: PhoneWhitelistService,
    private readonly appConfig: AppConfigService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    const telegramUserId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!telegramUserId || !chatId) {
      await ctx.reply('Não foi possível identificar seu usuário.');
      return;
    }

    const existingUser = await this.userRepository.findByTelegramUserId(telegramUserId);

    if (existingUser) {
      await this.userRepository.updateChatId(telegramUserId, chatId);
      const loginUrl = this.appConfig.getAppBaseUrl() + '/login';
      await ctx.reply(
        `Bem-vindo de volta! Acesse o painel pelo link:\n${loginUrl}`,
      );
      return;
    }

    await ctx.reply('Para começar, compartilhe seu contato para registro:', {
      reply_markup: {
        keyboard: [[{ text: 'Compartilhar Contato', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  async handleContact(ctx: Context): Promise<void> {
    const telegramUserId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const contact = ctx.message?.contact;

    if (!telegramUserId || !chatId || !contact) {
      await ctx.reply('Não foi possível processar o contato.');
      return;
    }

    if (contact.user_id !== telegramUserId) {
      await ctx.reply('Você deve compartilhar seu próprio contato, não o de outra pessoa.');
      return;
    }

    let phone = contact.phone_number;
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    if (!this.phoneWhitelistService.isAllowed(phone)) {
      await ctx.reply('Seu número de telefone não está autorizado.');
      return;
    }

    const existingByTelegram = await this.userRepository.findByTelegramUserId(telegramUserId);
    if (existingByTelegram) {
      await ctx.reply('Você já está registrado.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const existingByPhone = await this.userRepository.findByPhone(phone);
    if (existingByPhone) {
      await ctx.reply('Este número de telefone já está em uso por outro usuário.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    await this.userRepository.createUser({ phone, telegramUserId, chatId });

    const loginUrl = this.appConfig.getAppBaseUrl() + '/login';
    await ctx.reply(
      `Registro concluído com sucesso! Acesse o painel pelo link:\n${loginUrl}`,
      { reply_markup: { remove_keyboard: true } },
    );

    this.logger.log(`User registered: telegramUserId=${telegramUserId}, phone=${phone}`);
  }
}
