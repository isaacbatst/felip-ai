import { Module } from "@nestjs/common";
import { ActiveGroupsRepository } from "src/infrastructure/persistence/active-groups.repository";
import { ActiveGroupsStore } from "src/infrastructure/persistence/in-memory/active-groups-store";

@Module({
  providers: [
    {
      provide: ActiveGroupsRepository,
      useClass: ActiveGroupsStore,
    },
  ],
  exports: [
    ActiveGroupsRepository,
  ],
})
export class PersistenceModule {}