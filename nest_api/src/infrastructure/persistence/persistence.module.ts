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
  ],
  exports: [
    ConversationRepository,
    ActiveGroupsRepository,
    WorkerRepository,
    MessageProcessedLogRepository,
    MessageEnqueuedLogRepository,
    BotStatusRepository,
  ],
})
export class PersistenceModule {}