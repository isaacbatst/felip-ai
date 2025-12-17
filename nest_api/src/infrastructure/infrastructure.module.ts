import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';
import { TdlibUpdatesWorkerService } from '@/infrastructure/tdlib/tdlib-updates-worker.service';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { Module, forwardRef } from '@nestjs/common';
import { AppConfigService } from '../config/app.config';
import { DomainModule } from '../domain/domain.module';
import { MessageParser } from '../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../domain/interfaces/price-table-provider.interface';
import { GoogleSheetsCacheService } from './cache/google-sheets-cache.service';
import { GoogleSheetsService } from './google-sheets/google-sheets.service';
import { MessageParserService } from './openai/message-parser.service';
import { OpenAIService } from './openai/openai.service';
import { QueueModule } from './queue/queue.module';
import { TdlibModule } from './tdlib/tdlib.module';
import { ConversationStateService } from './telegram/conversation-state.service';
import { TelegramAuthCodeHandler } from './telegram/handlers/telegram-bot-auth-code.handler';
import { TelegramCommandHandler } from './telegram/handlers/telegram-bot-command.handler';
import { TelegramBotLoginResultHandler } from './telegram/handlers/telegram-bot-login-result.handler';
import { TelegramMessageHandler } from './telegram/handlers/telegram-bot-message.handler';
import { TelegramPhoneNumberHandler } from './telegram/handlers/telegram-bot-phone-number.handler';
import { TelegramPurchaseHandler } from './telegram/handlers/telegram-user-purchase.handler';
import { PhoneWhitelistService } from './telegram/phone-whitelist.service';
import { TelegramBotController } from './telegram/telegram-bot.controller';
import { TelegramUserMessageProcessor } from './telegram/telegram-user-message-processor';

/**
 * Module responsável por serviços de infraestrutura
 * Agrupa serviços relacionados a integrações externas
 */
@Module({
  imports: [DomainModule, PersistenceModule, TdlibModule, forwardRef(() => QueueModule)],
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
    TelegramMessageHandler,
    TelegramPhoneNumberHandler,
    TelegramAuthCodeHandler,
    TelegramCommandHandler,
    TelegramBotLoginResultHandler,
    TdlibUpdatesWorkerService,
    TelegramBotController,
    TelegramBotService,
    TelegramPurchaseHandler,
    TelegramUserMessageProcessor,
    PhoneWhitelistService,
    ConversationStateService,
  ],
  exports: [
    MessageParser,
    PriceTableProvider,
    TelegramBotController,
    PhoneWhitelistService,
    ConversationStateService,
    TelegramMessageHandler,
    TelegramUserMessageProcessor,
  ],
})
export class InfrastructureModule {}
