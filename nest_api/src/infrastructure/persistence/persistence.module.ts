import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/infrastructure/database/database.module";
import { ActiveGroupsRepository } from "@/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsDrizzleStore } from "@/infrastructure/persistence/drizzle/active-groups-drizzle-store";
import { ConversationRepository } from "@/infrastructure/persistence/conversation.repository";
import { ConversationDrizzleStore } from "@/infrastructure/persistence/drizzle/conversation-drizzle-store";
import { WorkerRepository } from "@/infrastructure/persistence/worker.repository";
import { WorkerDrizzleStore } from "@/infrastructure/persistence/drizzle/worker-drizzle-store";
import { MessageProcessedLogRepository } from "@/infrastructure/persistence/message-processed-log.repository";
import { MessageProcessedLogDrizzleStore } from "@/infrastructure/persistence/drizzle/message-processed-log-drizzle-store";
import { MessageEnqueuedLogRepository } from "@/infrastructure/persistence/message-enqueued-log.repository";
import { MessageEnqueuedLogDrizzleStore } from "@/infrastructure/persistence/drizzle/message-enqueued-log-drizzle-store";
import { BotStatusRepository } from "@/infrastructure/persistence/bot-status.repository";
import { BotStatusDrizzleStore } from "@/infrastructure/persistence/drizzle/bot-status-drizzle-store";
import { AuthTokenRepository } from "@/infrastructure/persistence/auth-token.repository";
import { AuthTokenDrizzleStore } from "@/infrastructure/persistence/drizzle/auth-token-drizzle-store";
import { DashboardTokenRepository } from "@/infrastructure/persistence/dashboard-token.repository";
import { DashboardTokenDrizzleStore } from "@/infrastructure/persistence/drizzle/dashboard-token-drizzle-store";
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
import { SubscriptionTokenRepository } from "@/infrastructure/persistence/subscription-token.repository";
import { SubscriptionTokenDrizzleStore } from "@/infrastructure/persistence/drizzle/subscription-token-drizzle-store";
import { WebSessionRepository } from "@/infrastructure/persistence/web-session.repository";
import { WebSessionDrizzleStore } from "@/infrastructure/persistence/drizzle/web-session-drizzle-store";
import { UserRepository } from "@/infrastructure/persistence/user.repository";
import { UserDrizzleStore } from "@/infrastructure/persistence/drizzle/user-drizzle-store";
import { OtpRepository } from "@/infrastructure/persistence/otp.repository";
import { OtpDrizzleStore } from "@/infrastructure/persistence/drizzle/otp-drizzle-store";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ConversationRepository,
      useClass: ConversationDrizzleStore,
    },
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
      provide: BotStatusRepository,
      useClass: BotStatusDrizzleStore,
    },
    {
      provide: AuthTokenRepository,
      useClass: AuthTokenDrizzleStore,
    },
    {
      provide: DashboardTokenRepository,
      useClass: DashboardTokenDrizzleStore,
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
      provide: SubscriptionTokenRepository,
      useClass: SubscriptionTokenDrizzleStore,
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
  ],
  exports: [
    ConversationRepository,
    ActiveGroupsRepository,
    WorkerRepository,
    MessageProcessedLogRepository,
    MessageEnqueuedLogRepository,
    BotStatusRepository,
    AuthTokenRepository,
    DashboardTokenRepository,
    UserDataRepository,
    MilesProgramRepository,
    CounterOfferSettingsRepository,
    PromptConfigRepository,
    SubscriptionPlanRepository,
    SubscriptionRepository,
    SubscriptionTokenRepository,
    WebSessionRepository,
    UserRepository,
    OtpRepository,
  ],
})
export class PersistenceModule {}