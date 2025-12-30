import { AppConfigService } from '@/config/app.config';
import { WorkerRepository } from '@/infrastructure/persistence/worker.repository';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { Injectable, Logger } from '@nestjs/common';
import Docker, { Container } from 'dockerode';
import fs from 'node:fs';

@Injectable()
export class WorkerManagerCompose extends WorkerManager {
  private docker = new Docker();
  private readonly logger = new Logger(WorkerManagerCompose.name);

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly workerRepository: WorkerRepository,
  ) {
    super();
  }

  async getHostname(_userId: string): Promise<string> {
    return `localhost`;
  }

  /**
   * Get or assign a port for a worker
   */
  private async getPortForWorker(userId: string): Promise<number> {
    // Check if port already assigned
    const existingPort = await this.workerRepository.getWorkerPort(userId);
    if (existingPort !== null) {
      return existingPort;
    }
    
    // Get next available port (computed from existing assignments)
    const nextPort = await this.workerRepository.getNextPort();
    if (nextPort === null) {
      throw new Error('Failed to compute next available port');
    }
    
    // Assign port to worker
    const assignedPort = nextPort;
    await this.workerRepository.setWorkerPort(userId, assignedPort);
    
    this.logger.log(`Assigned port ${assignedPort} to worker for user ${userId}`);
    return assignedPort;
  }

  /**
   * Get the HTTP port for a worker
   */
  async getWorkerPort(userId: string): Promise<number | null> {
    return await this.workerRepository.getWorkerPort(userId);
  }

  async run(userId: string): Promise<boolean> {
    const name = this.getContainerNameByUserId(userId);
    const exists = await this.getStatus(userId);
    if (exists && exists.state === 'running') {
      this.logger.log(`Worker for user ${userId} is already running`);
      return true;
    }

    if (exists && exists.state === 'stopped') {
      return await this.startByUserId(userId);
    }

    if (exists) {
      this.logger.error(`Container ${name} already exists but unknown state`);
      return false;
    }

    this.logger.log(`Creating container ${name}`);
    const envVars = await this.getEnvFromPath(this.appConfigService.getWorkerEnvFile());
    // Add USER_ID to environment variables so worker knows which queue to listen to
    envVars.push(`USER_ID=${userId}`);
    // Assign and set HTTP port for this worker
    const httpPort = await this.getPortForWorker(userId);
    envVars.push(`HTTP_PORT=${httpPort}`);
    const container = await this.docker.createContainer({
      Image: this.getImageName(),
      name,
      Env: envVars,
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: [`tdlib-${userId}:/tdlib`],
        PortBindings: {
          [`${httpPort}/tcp`]: [{
            HostPort: `${httpPort}`,
          }],
        },
      },
      Labels: {
        'tdlib.user': userId,
      },
      Healthcheck: {
        Test: ['CMD', 'curl', '-f', `http://localhost:${httpPort}/health`],
        Interval: 10000000000, // 10 seconds in nanoseconds
        Timeout: 5000000000, // 5 seconds in nanoseconds
        Retries: 5,
      },
    });
    this.logger.log(`Container ${name} created`);
    return await this.startContainer(container);
  }

  async startByUserId(userId: string): Promise<boolean> {
    const name = this.getContainerNameByUserId(userId);
    const container = this.docker.getContainer(name);
    return this.startContainer(container);
  }

  async startContainer(container: Container): Promise<boolean> {
    this.logger.log(`Starting container ${container.id}`);
    await container.start();
    this.logger.log(`Container ${container.id} started`);
    const isHealthy = await this.waitUntilHealthy(container.id);
    this.logger.log(`Container ${container.id} is healthy: ${isHealthy}`);
    if (!isHealthy) {
      await container.stop();
      return false;
    }
    return isHealthy;
  }

  stop(userId: string): Promise<void> {
    const name = this.getContainerNameByUserId(userId);
    return this.docker.getContainer(name).stop();
  }
  async getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null> {
    const name = this.getContainerNameByUserId(userId);
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

  async waitUntilHealthy(containerId: string, options: { timeout?: number, interval?: number } = { timeout: 120000, interval: 5000 }): Promise<boolean> {
    const { timeout = 120000, interval = 5000 } = options;
    const START_TIME = Date.now();
    let elapsedTime = 0;
    return await new Promise((resolve) => {
      console.log(`Waiting for container ${containerId} to be healthy, timeout: ${timeout}, interval: ${interval}`);
      const intervalId = setInterval(async () => {
        elapsedTime = Date.now() - START_TIME;
        if (elapsedTime > timeout) {
          console.log(`Timeout reached for container ${containerId}`);
          clearInterval(intervalId);
          resolve(false);
        }
        const isHealthy = await this.isHealthy(containerId);
        console.log(`Container ${containerId} is healthy: ${isHealthy}`);
        if (isHealthy) {
          clearInterval(intervalId);
          resolve(true);
        }
      }, interval);
    });
  }

  private async isHealthy(containerId: string): Promise<boolean> {
    const container = this.docker.getContainer(containerId);
    const health = await container.inspect();
    return health.State.Health?.Status === 'healthy';
  }

  private getContainerNameByUserId(userId: string): string {
    return `tdlib-${userId}`;
  }

  private getImageName(): string {
    return 'isaacbatst/tdlib-worker:latest';
  }

  private async getEnvFromPath(path: string): Promise<string[]> {
    const content = await fs.promises.readFile(path, 'utf8');
    return content.split('\n').filter((line) => line.trim() !== '');
  }
}
