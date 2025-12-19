import { Module } from "@nestjs/common";
import { ActiveGroupsRepository } from "@/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsRedisStore } from "@/infrastructure/persistence/redis/active-groups-redis-store";
import { ConversationRepository } from "@/infrastructure/persistence/conversation.repository";
import { ConversationRedisStore } from "@/infrastructure/persistence/redis/conversation-redis-store";
import { WorkerRepository } from "@/infrastructure/persistence/worker.repository";
import { WorkerRedisStore } from "@/infrastructure/persistence/redis/worker-redis-store";
import { RedisRepository } from "@/infrastructure/persistence/redis/redis.repository";

@Module({
  providers: [
    RedisRepository,
    {
      provide: ConversationRepository,
      useClass: ConversationRedisStore,
    },
    {
      provide: ActiveGroupsRepository,
      useClass: ActiveGroupsRedisStore,
    },
    {
      provide: WorkerRepository,
      useClass: WorkerRedisStore,
    },
  ],
  exports: [
    ConversationRepository,
    ActiveGroupsRepository,
    WorkerRepository,
  ],
})
export class PersistenceModule {}