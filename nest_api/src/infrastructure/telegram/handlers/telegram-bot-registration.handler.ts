import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'grammy';
import { UserRepository } from '@/infrastructure/persistence/user.repository';
import { AppConfigService } from '@/config/app.config';
import { RegistrationTokenService } from '@/infrastructure/auth/registration-token.service';

@Injectable()
export class TelegramBotRegistrationHandler {
  private readonly logger = new Logger(TelegramBotRegistrationHandler.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly appConfig: AppConfigService,
    private readonly registrationTokenService: RegistrationTokenService,
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
      const encodedPhone = encodeURIComponent(existingUser.phone);
      const loginUrl = this.appConfig.getAppBaseUrl() + `/login?phone=${encodedPhone}`;
      await ctx.reply(
        `Bem-vindo de volta! Acesse o painel pelo link:\n${loginUrl}`,
      );
      return;
    }

    const token = this.registrationTokenService.create(telegramUserId, chatId);
    const loginUrl = this.appConfig.getAppBaseUrl() + `/login?token=${token}`;
    await ctx.reply(
      `Para começar, acesse o link abaixo e registre seu telefone:\n${loginUrl}`,
    );
  }
}
