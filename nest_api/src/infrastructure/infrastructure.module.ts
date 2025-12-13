import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app.config';
import { DomainModule } from '../domain/domain.module';
import { MessageParser } from '../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../domain/interfaces/price-table-provider.interface';
import { GoogleSheetsCacheService } from './cache/google-sheets-cache.service';
import { GoogleSheetsService } from './google-sheets/google-sheets.service';
import { MessageParserService } from './openai/message-parser.service';
import { OpenAIService } from './openai/openai.service';
import { ConversationStateService } from './telegram/conversation-state.service';
import { TelegramCommandHandler } from './telegram/handlers/telegram-command.handler';
import { TelegramMessageHandler } from './telegram/handlers/telegram-message.handler';
import { TelegramPhoneNumberHandler } from './telegram/handlers/telegram-phone-number.handler';
import { TelegramPurchaseHandler } from './telegram/handlers/telegram-purchase.handler';
import { Queue } from './telegram/interfaces/queue.interface';
import { TelegramMessageSender } from './telegram/interfaces/telegram-message-sender.interface';
import { QueueInMemory } from './telegram/queue-in-memory';
import { PhoneWhitelistService } from './telegram/phone-whitelist.service';
import { TelegramBotService } from './telegram/telegram-bot.service';
import { TelegramLoginOrchestratorService } from './telegram/telegram-login-orchestrator.service';
import { TelegramUserClient } from './telegram/telegram-user-client';
import { TelegramUserLoginHandler } from './telegram/telegram-user-login-handler';
import { TelegramUserMessageHandler } from './telegram/telegram-user-message-handler';
import { TelegramUserMessageSender } from './telegram/telegram-user-message-sender';

/**
 * Module responsável por serviços de infraestrutura
 * Agrupa serviços relacionados a integrações externas
 */
@Module({
  imports: [DomainModule],
  providers: [
    AppConfigService,
    GoogleSheetsService,
    OpenAIService,
    {
      provide: PriceTableProvider,
      useFactory: (config: AppConfigService, googleSheetsService: GoogleSheetsService) => {
        return new GoogleSheetsCacheService(
          {
            spreadsheetId: config.getGoogleSpreadsheetId(),
            keyFile: config.getGoogleServiceAccountKeyFile(),
            ttlSeconds: config.getPriceTableCacheTtlSeconds(),
            debugPrefix: 'price-table-cache-v2',
          },
          googleSheetsService,
        );
      },
      inject: [AppConfigService, GoogleSheetsService],
    },
    {
      provide: MessageParser,
      useClass: MessageParserService,
    },
    {
      provide: TelegramMessageSender,
      useClass: TelegramUserMessageSender,
    },
    {
      provide: Queue,
      useFactory: (config: AppConfigService) => {
        return new QueueInMemory(config.getQueueMaxItems());
      },
      inject: [AppConfigService],
    },
    TelegramMessageHandler,
    TelegramPhoneNumberHandler,
    TelegramCommandHandler,
    TelegramBotService,
    TelegramUserClient,
    TelegramPurchaseHandler,
    TelegramUserMessageHandler,
    TelegramUserMessageSender,
    TelegramUserLoginHandler,
    PhoneWhitelistService,
    ConversationStateService,
    TelegramLoginOrchestratorService,
  ],
  exports: [
    MessageParser,
    PriceTableProvider,
    TelegramBotService,
    TelegramMessageSender,
    PhoneWhitelistService,
    ConversationStateService,
    TelegramLoginOrchestratorService,
  ],
})
export class InfrastructureModule {}
