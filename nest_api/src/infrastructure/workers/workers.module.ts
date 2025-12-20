import { AppConfigService } from "@/config/app.config";
import { PersistenceModule } from "@/infrastructure/persistence/persistence.module";
import { WorkerRepository } from "@/infrastructure/persistence/worker.repository";
import { WorkerManager } from "@/infrastructure/workers/worker-manager";
import { WorkerManagerCompose } from "@/infrastructure/workers/worker-manager-compose";
import { WorkerManagerSwarm } from "@/infrastructure/workers/worker-manager-swarm";
import { Module } from "@nestjs/common";

@Module({
  imports: [PersistenceModule],
  providers: [
    AppConfigService,
    {
      provide: WorkerManager,
      inject: [AppConfigService, WorkerRepository],
      useFactory: (appConfigService: AppConfigService, workerRepository: WorkerRepository) => {
        const managerType = appConfigService.getWorkerManagerType();
        if (managerType === 'swarm') {
          return new WorkerManagerSwarm(appConfigService, workerRepository);
        }
        return new WorkerManagerCompose(appConfigService, workerRepository);
      },
    },
  ],
  exports: [
    WorkerManager,
  ],
})
export class WorkersModule {}