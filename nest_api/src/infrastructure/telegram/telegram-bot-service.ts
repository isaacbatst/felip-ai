import { AppConfigService } from '@/config/app.config';
import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';

@Injectable()
export class TelegramBotService {
  readonly bot: Bot;

  constructor(private readonly config: AppConfigService) {
    this.bot = new Bot(this.config.getTelegramBotToken());
  }
}