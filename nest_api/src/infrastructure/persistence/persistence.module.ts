import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/infrastructure/database/database.module";
import { ActiveGroupsRepository } from "@/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsDrizzleStore } from "@/infrastructure/persistence/drizzle/active-groups-drizzle-store";
import { WorkerRepository } from "@/infrastructure/persistence/worker.repository";
import { WorkerDrizzleStore } from "@/infrastructure/persistence/drizzle/worker-drizzle-store";
import { MessageProcessedLogRepository } from "@/infrastructure/persistence/message-processed-log.repository";
import { MessageProcessedLogDrizzleStore } from "@/infrastructure/persistence/drizzle/message-processed-log-drizzle-store";
import { MessageEnqueuedLogRepository } from "@/infrastructure/persistence/message-enqueued-log.repository";
import { MessageEnqueuedLogDrizzleStore } from "@/infrastructure/persistence/drizzle/message-enqueued-log-drizzle-store";
import { BotPreferenceRepository } from "@/infrastructure/persistence/bot-status.repository";
import { BotPreferenceDrizzleStore } from "@/infrastructure/persistence/drizzle/bot-status-drizzle-store";
import { UserDataRepository } from "@/infrastructure/persistence/user-data.repository";
import { UserDataDrizzleStore } from "@/infrastructure/persistence/drizzle/user-data-drizzle-store";
import { MilesProgramRepository } from "@/infrastructure/persistence/miles-program.repository";
import { MilesProgramDrizzleStore } from "@/infrastructure/persistence/drizzle/miles-program-drizzle-store";
import { CounterOfferSettingsRepository } from "@/infrastructure/persistence/counter-offer-settings.repository";
import { CounterOfferSettingsDrizzleStore } from "@/infrastructure/persistence/drizzle/counter-offer-settings-drizzle-store";
import { PromptConfigRepository } from "@/infrastructure/persistence/prompt-config.repository";
import { PromptConfigDrizzleStore } from "@/infrastructure/persistence/drizzle/prompt-config-drizzle-store";
import { SubscriptionPlanRepository } from "@/infrastructure/persistence/subscription-plan.repository";
import { SubscriptionPlanDrizzleStore } from "@/infrastructure/persistence/drizzle/subscription-plan-drizzle-store";
import { SubscriptionRepository } from "@/infrastructure/persistence/subscription.repository";
import { SubscriptionDrizzleStore } from "@/infrastructure/persistence/drizzle/subscription-drizzle-store";
import { WebSessionRepository } from "@/infrastructure/persistence/web-session.repository";
import { WebSessionDrizzleStore } from "@/infrastructure/persistence/drizzle/web-session-drizzle-store";
import { UserRepository } from "@/infrastructure/persistence/user.repository";
import { UserDrizzleStore } from "@/infrastructure/persistence/drizzle/user-drizzle-store";
import { OtpRepository } from "@/infrastructure/persistence/otp.repository";
import { OtpDrizzleStore } from "@/infrastructure/persistence/drizzle/otp-drizzle-store";
import { SubscriptionPaymentRepository } from "@/infrastructure/persistence/subscription-payment.repository";
import { SubscriptionPaymentDrizzleStore } from "@/infrastructure/persistence/drizzle/subscription-payment-drizzle-store";
import { CieloWebhookEventRepository } from "@/infrastructure/persistence/cielo-webhook-event.repository";
import { CieloWebhookEventDrizzleStore } from "@/infrastructure/persistence/drizzle/cielo-webhook-event-drizzle-store";
import { CouponRepository } from "@/infrastructure/persistence/coupon.repository";
import { CouponDrizzleStore } from "@/infrastructure/persistence/drizzle/coupon-drizzle-store";
import { GroupDelaySettingsRepository } from "@/infrastructure/persistence/group-delay-settings.repository";
import { GroupDelaySettingsDrizzleStore } from "@/infrastructure/persistence/drizzle/group-delay-settings-drizzle-store";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ActiveGroupsRepository,
      useClass: ActiveGroupsDrizzleStore,
    },
    {
      provide: WorkerRepository,
      useClass: WorkerDrizzleStore,
    },
    {
      provide: MessageProcessedLogRepository,
      useClass: MessageProcessedLogDrizzleStore,
    },
    {
      provide: MessageEnqueuedLogRepository,
      useClass: MessageEnqueuedLogDrizzleStore,
    },
    {
      provide: BotPreferenceRepository,
      useClass: BotPreferenceDrizzleStore,
    },
    {
      provide: UserDataRepository,
      useClass: UserDataDrizzleStore,
    },
    {
      provide: MilesProgramRepository,
      useClass: MilesProgramDrizzleStore,
    },
    {
      provide: CounterOfferSettingsRepository,
      useClass: CounterOfferSettingsDrizzleStore,
    },
    {
      provide: PromptConfigRepository,
      useClass: PromptConfigDrizzleStore,
    },
    {
      provide: SubscriptionPlanRepository,
      useClass: SubscriptionPlanDrizzleStore,
    },
    {
      provide: SubscriptionRepository,
      useClass: SubscriptionDrizzleStore,
    },
    {
      provide: WebSessionRepository,
      useClass: WebSessionDrizzleStore,
    },
    {
      provide: UserRepository,
      useClass: UserDrizzleStore,
    },
    {
      provide: OtpRepository,
      useClass: OtpDrizzleStore,
    },
    {
      provide: SubscriptionPaymentRepository,
      useClass: SubscriptionPaymentDrizzleStore,
    },
    {
      provide: CieloWebhookEventRepository,
      useClass: CieloWebhookEventDrizzleStore,
    },
    {
      provide: CouponRepository,
      useClass: CouponDrizzleStore,
    },
    {
      provide: GroupDelaySettingsRepository,
      useClass: GroupDelaySettingsDrizzleStore,
    },
  ],
  exports: [
    ActiveGroupsRepository,
    WorkerRepository,
    MessageProcessedLogRepository,
    MessageEnqueuedLogRepository,
    BotPreferenceRepository,
    UserDataRepository,
    MilesProgramRepository,
    CounterOfferSettingsRepository,
    PromptConfigRepository,
    SubscriptionPlanRepository,
    SubscriptionRepository,
    WebSessionRepository,
    UserRepository,
    OtpRepository,
    SubscriptionPaymentRepository,
    CieloWebhookEventRepository,
    CouponRepository,
    GroupDelaySettingsRepository,
  ],
})
export class PersistenceModule {}