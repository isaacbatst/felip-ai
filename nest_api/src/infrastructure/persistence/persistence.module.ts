import { Module } from "@nestjs/common";
import { ActiveGroupsRepository } from "@/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsRedisStore } from "@/infrastructure/persistence/redis/active-groups-redis-store";
import { ConversationRepository } from "@/infrastructure/persistence/conversation.repository";
import { ConversationRedisStore } from "@/infrastructure/persistence/redis/conversation-redis-store";
import { RedisRepository } from "@/infrastructure/persistence/redis/redis.repository";
import { RedisStore } from "@/infrastructure/persistence/redis/redis-store";

@Module({
  providers: [
    {
      provide: RedisRepository,
      useClass: RedisStore,
    },
    {
      provide: ConversationRepository,
      useClass: ConversationRedisStore,
    },
    {
      provide: ActiveGroupsRepository,
      useClass: ActiveGroupsRedisStore,
    },
    RedisStore,
  ],
  exports: [
    ConversationRepository,
    ActiveGroupsRepository,
    RedisStore,
  ],
})
export class PersistenceModule {}