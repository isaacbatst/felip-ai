import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app.config';
import { DomainModule } from '../domain/domain.module';
import { MessageParser } from '../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../domain/interfaces/price-table-provider.interface';
import { DatabasePriceTableProvider } from './cache/database-price-table-provider';
import { MessageParserService } from './openai/message-parser.service';
import { OpenAIService } from './openai/openai.service';
import { QueueModule } from './queue/queue.module';
import { TelegramBotRegistrationHandler } from './telegram/handlers/telegram-bot-registration.handler';
import { TelegramPurchaseHandler } from './telegram/handlers/telegram-user-purchase.handler';
import { PhoneWhitelistService } from './telegram/phone-whitelist.service';
import { TelegramBotController } from './telegram/telegram-bot.controller';
import { TelegramUserMessageProcessor } from './telegram/telegram-user-message-processor';
import { WorkersModule } from '@/infrastructure/workers/workers.module';
import { TdlibCommandResponseHandler } from '@/infrastructure/tdlib/tdlib-command-response.handler';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { TdlibUpdatesWorkerRabbitMQ } from '@/infrastructure/queue/rabbitmq/tdlib-updates-worker-rabbitmq.service';
import { OtpService } from './auth/otp.service';
import { RegistrationTokenService } from './auth/registration-token.service';
import { DashboardController } from './http/dashboard.controller';
import { LandingController } from './http/landing.controller';
import { SubscriptionController } from './http/subscription.controller';
import { SubscriptionService } from './subscription/subscription.service';
import { SubscriptionAuthorizationService } from './subscription/subscription-authorization.service';
import { HybridAuthorizationService } from './subscription/hybrid-authorization.service';
import { SessionGuard } from './http/guards/session.guard';
import { LoginController } from './http/login.controller';
import { RegisterController } from './http/register.controller';
import { AuthErrorCacheService } from './tdlib/auth-error-cache.service';

/**
 * Module responsável por serviços de infraestrutura
 * Agrupa serviços relacionados a integrações externas
 */
@Module({
  imports: [DomainModule, PersistenceModule, QueueModule, WorkersModule],
  controllers: [LandingController, DashboardController, SubscriptionController, LoginController, RegisterController],
  providers: [
    AppConfigService,
    OpenAIService,
    TelegramUserClientProxyService,
    {
      provide: PriceTableProvider,
      useClass: DatabasePriceTableProvider,
    },
    {
      provide: MessageParser,
      useClass: MessageParserService,
    },
    TelegramBotRegistrationHandler,
    TelegramBotController,
    TelegramBotService,
    TelegramPurchaseHandler,
    TelegramUserMessageProcessor,
    PhoneWhitelistService,
    TdlibCommandResponseHandler,
    AuthErrorCacheService,
    OtpService,
    RegistrationTokenService,
    TdlibUpdatesWorkerRabbitMQ,
    // Subscription services
    SubscriptionService,
    SubscriptionAuthorizationService,
    HybridAuthorizationService,
    // Guards
    SessionGuard,
  ],
  exports: [
    MessageParser,
    PriceTableProvider,
    TelegramBotController,
    PhoneWhitelistService,
    TelegramUserMessageProcessor,
    SubscriptionService,
    SubscriptionAuthorizationService,
    HybridAuthorizationService,
    AuthErrorCacheService,
  ],
})
export class InfrastructureModule {}
