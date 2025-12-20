import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/infrastructure/database/database.module";
import { ActiveGroupsRepository } from "@/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsDrizzleStore } from "@/infrastructure/persistence/drizzle/active-groups-drizzle-store";
import { ConversationRepository } from "@/infrastructure/persistence/conversation.repository";
import { ConversationDrizzleStore } from "@/infrastructure/persistence/drizzle/conversation-drizzle-store";
import { WorkerRepository } from "@/infrastructure/persistence/worker.repository";
import { WorkerDrizzleStore } from "@/infrastructure/persistence/drizzle/worker-drizzle-store";

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
  ],
  exports: [
    ConversationRepository,
    ActiveGroupsRepository,
    WorkerRepository,
  ],
})
export class PersistenceModule {}