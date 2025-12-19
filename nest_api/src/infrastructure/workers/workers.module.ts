import { AppConfigService } from "@/config/app.config";
import { PersistenceModule } from "@/infrastructure/persistence/persistence.module";
import { WorkerManager } from "@/infrastructure/workers/worker-manager";
import { WorkerManagerCompose } from "@/infrastructure/workers/worker-manager-compose";
import { Module } from "@nestjs/common";

@Module({
  imports: [PersistenceModule],
  providers: [
    AppConfigService,
    {
      provide: WorkerManager,
      useClass: WorkerManagerCompose,
    },
  ],
  exports: [
    WorkerManager,
  ],
})
export class WorkersModule {}