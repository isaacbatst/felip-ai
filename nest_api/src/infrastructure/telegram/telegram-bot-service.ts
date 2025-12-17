import { AppConfigService } from '@/config/app.config';
import { Injectable, Logger } from '@nestjs/common';
import { Bot } from 'grammy';

@Injectable()
export class TelegramBotService {
  readonly bot: Bot;
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(private readonly config: AppConfigService) {
    this.bot = new Bot(this.config.getTelegramBotToken());
  }
}