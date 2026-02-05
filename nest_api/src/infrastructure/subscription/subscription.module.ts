import { Module } from '@nestjs/common';
import { PersistenceModule } from '@/infrastructure/persistence/persistence.module';
import { ConfigModule } from '@nestjs/config';
import { SubscriptionService } from './subscription.service';
import { SubscriptionAuthorizationService } from './subscription-authorization.service';
import { HybridAuthorizationService } from './hybrid-authorization.service';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { AppConfigService } from '@/config/app.config';

@Module({
  imports: [PersistenceModule, ConfigModule],
  providers: [
    SubscriptionService,
    SubscriptionAuthorizationService,
    HybridAuthorizationService,
    PhoneWhitelistService,
    AppConfigService,
  ],
  exports: [
    SubscriptionService,
    SubscriptionAuthorizationService,
    HybridAuthorizationService,
  ],
})
export class SubscriptionModule {}
