import { AppConfigService } from "@/config/app.config";
import { WorkerManager } from "@/infrastructure/workers/worker-manager";
import { WorkerManagerCompose } from "@/infrastructure/workers/worker-manager-compose";
import { Module } from "@nestjs/common";

@Module({
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