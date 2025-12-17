import { AppConfigService } from '@/config/app.config';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { Injectable, Logger } from '@nestjs/common';
import Docker from 'dockerode';
import fs from 'fs';

@Injectable()
export class WorkerManagerCompose extends WorkerManager {
  private docker = new Docker();
  private readonly logger = new Logger(WorkerManagerCompose.name);

  constructor(private readonly appConfigService: AppConfigService) {
    super();
  }

  async start(userId: string) {
    const name = this.getContainerName(userId);
    const exists = await this.getStatus(userId);
    if (exists && exists.state === 'running') {
      this.logger.log(`Worker for user ${userId} is already running`);
      return;
    }

    if (exists && exists.state === 'stopped') {
      await this.docker.getContainer(name).start();
      this.logger.log(`Worker for user ${userId} is started`);
      return;
    }

    if (exists) {
      this.logger.error(`Container ${name} already exists`);
      return;
    }

    this.logger.log(`Creating container ${name}`);
    const container = await this.docker.createContainer({
      Image: this.getImageName(),
      name,
      Env: await this.getEnvFromPath(this.appConfigService.getWorkerEnvFile()),
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [`tdlib-${userId}:/tdlib`],
        NetworkMode: 'host',
      },
      Labels: {
        'tdlib.user': userId,
      },
    });

    await container.start();
  }
  stop(userId: string): Promise<void> {
    const name = this.getContainerName(userId);
    return this.docker.getContainer(name).stop();
  }
  async getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null> {
    const name = this.getContainerName(userId);
    try {
      const container = await this.docker.getContainer(name).inspect();
      if (!container) {
        return null;
      }
      return { state: container.State.Running ? 'running' : 'stopped' };
    } catch (error) {
      this.logger.warn(`Error getting status of container ${name}: ${error}`);
      return null;
    }
  }

  private getContainerName(userId: string): string {
    return `tdlib-${userId}`;
  }

  private getImageName(): string {
    return 'worker-test:latest';
  }

  private async getEnvFromPath(path: string): Promise<string[]> {
    const content = await fs.promises.readFile(path, 'utf8');
    return content.split('\n').filter((line) => line.trim() !== '');
  }
}
