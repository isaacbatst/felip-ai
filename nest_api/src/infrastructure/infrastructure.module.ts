import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app.config';
import { DomainModule } from '../domain/domain.module';
import { MessageParser } from '../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../domain/interfaces/price-table-provider.interface';
import { GoogleSheetsCacheService } from './cache/google-sheets-cache.service';
import { GoogleSheetsService } from './google-sheets/google-sheets.service';
import { MessageParserService } from './openai/message-parser.service';
import { OpenAIService } from './openai/openai.service';
import { QueueModule } from './queue/queue.module';
import { TelegramAuthCodeHandler } from './telegram/handlers/telegram-bot-auth-code.handler';
import { TelegramCommandHandler } from './telegram/handlers/telegram-bot-command.handler';
import { TelegramBotLoginResultHandler } from './telegram/handlers/telegram-bot-login-result.handler';
import { TelegramBotMessageHandler } from './telegram/handlers/telegram-bot-message.handler';
import { TelegramPhoneNumberHandler } from './telegram/handlers/telegram-bot-phone-number.handler';
import { TelegramPurchaseHandler } from './telegram/handlers/telegram-user-purchase.handler';
import { PhoneWhitelistService } from './telegram/phone-whitelist.service';
import { TelegramBotController } from './telegram/telegram-bot.controller';
import { TelegramUserMessageProcessor } from './telegram/telegram-user-message-processor';
import { WorkersModule } from '@/infrastructure/workers/workers.module';
import { TdlibCommandResponseHandler } from '@/infrastructure/tdlib/tdlib-command-response.handler';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { TelegramBotQueueProcessorRabbitMQ } from '@/infrastructure/queue/rabbitmq/telegram-bot-queue-processor-rabbitmq.service';
import { TelegramUserQueueProcessorRabbitMQ } from '@/infrastructure/queue/rabbitmq/telegram-user-queue-processor-rabbitmq.service';
import { TdlibUpdatesWorkerRabbitMQ } from '@/infrastructure/queue/rabbitmq/tdlib-updates-worker-rabbitmq.service';
import { AuthCodeDeduplicationService } from './telegram/auth-code-deduplication.service';

/**
 * Module responsável por serviços de infraestrutura
 * Agrupa serviços relacionados a integrações externas
 */
@Module({
  imports: [DomainModule, PersistenceModule, QueueModule, WorkersModule],
  providers: [
    AppConfigService,
    GoogleSheetsService,
    OpenAIService,
    TelegramUserClientProxyService,
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
    TelegramBotMessageHandler,
    TelegramPhoneNumberHandler,
    TelegramAuthCodeHandler,
    TelegramCommandHandler,
    TelegramBotLoginResultHandler,
    TelegramBotController,
    TelegramBotService,
    TelegramPurchaseHandler,
    TelegramUserMessageProcessor,
    PhoneWhitelistService,
    TdlibCommandResponseHandler,
    AuthCodeDeduplicationService,
    TelegramUserQueueProcessorRabbitMQ,
    TelegramBotQueueProcessorRabbitMQ,
    TdlibUpdatesWorkerRabbitMQ,
  ],
  exports: [
    MessageParser,
    PriceTableProvider,
    TelegramBotController,
    PhoneWhitelistService,
    TelegramBotMessageHandler,
    TelegramUserMessageProcessor,
  ],
})
export class InfrastructureModule {}
