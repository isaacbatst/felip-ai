import { AppConfigService } from '@/config/app.config';
import { WorkerRepository } from '@/infrastructure/persistence/worker.repository';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Docker from 'dockerode';
import fs from 'node:fs';

@Injectable()
export class WorkerManagerSwarm extends WorkerManager implements OnModuleDestroy {
  private docker = new Docker();
  private readonly logger = new Logger(WorkerManagerSwarm.name);
  private readonly activeIntervals = new Set<NodeJS.Timeout>();

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly workerRepository: WorkerRepository,
  ) {
    super();
    this.setupExitHandlers();
  }

  // ==================== Public Methods ====================

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Module destroying, cleaning up active intervals');
    this.clearAllIntervals();
  }

  /**
   * Get the HTTP port for a worker
   */
  async getWorkerPort(userId: string): Promise<number | null> {
    return await this.workerRepository.getWorkerPort(userId);
  }

  async run(userId: string): Promise<boolean> {
    const serviceName = this.getServiceNameByUserId(userId);
    const status = await this.getStatus(userId);
    
    if (status && status.state === 'running') {
      this.logger.log(`Service for user ${userId} is already running`);
      return true;
    }

    if (status && status.state === 'stopped') {
      return await this.startByUserId(userId);
    }

    // Service doesn't exist, create it
    this.logger.log(`Creating service ${serviceName}`);
    
    // Ensure volume exists before creating service
    await this.ensureVolumeExists(userId);
    
    const envVars = await this.getEnvFromPath(this.appConfigService.getWorkerEnvFile());
    // Add USER_ID to environment variables so worker knows which queue to listen to
    envVars.push(`USER_ID=${userId}`);
    // Assign and set HTTP port for this worker
    const httpPort = await this.getPortForWorker(userId);
    envVars.push(`HTTP_PORT=${httpPort}`);

    try {
      await this.docker.createService({
        Name: serviceName,
        Networks: [
          {
            Target: 'felip-ai_default',
          }
        ],
        TaskTemplate: {
          ContainerSpec: {
            Image: this.getImageName(),
            Env: envVars,
            Mounts: [
              {
                Type: 'volume',
                Source: `tdlib-${userId}`,
                Target: '/tdlib',
              },
            ],
            Labels: {
              'tdlib.user': userId,
            },
            HealthCheck: {
              Test: ['CMD', 'curl', '-f', `http://localhost:${httpPort}/health`],
              Interval: 10000000000, // 10 seconds in nanoseconds
              Timeout: 5000000000, // 5 seconds in nanoseconds
              Retries: 5,
              StartPeriod: 30000000000, // 30 seconds grace period
            },
          },
          RestartPolicy: {
            Condition: 'on-failure',
          },
          Placement: {
            Constraints: [],
          },
        },
        Mode: {
          Replicated: {
            Replicas: 1,
          },
        },
        UpdateConfig: {
          Parallelism: 1,
          Delay: 10000000000, // 10 seconds
          FailureAction: 'rollback',
          Order: 'start-first',
        },
        EndpointSpec: {
          Mode: 'vip',
          Ports: [
            {
              Protocol: 'tcp',
              TargetPort: httpPort,
              PublishedPort: httpPort,
              PublishMode: 'ingress',
            },
          ],
        },
        Labels: {
          'tdlib.user': userId,
        },
      });

      this.logger.log(`Service ${serviceName} created`);
      
      // Wait for service to be running and healthy
      const isHealthy = await this.waitUntilHealthy(userId);
      this.logger.log(`Service ${serviceName} is healthy: ${isHealthy}`);
      
      if (!isHealthy) {
        // Try to remove the service if it failed to become healthy
        try {
          const serviceObj = this.docker.getService(serviceName);
          await serviceObj.remove();
          this.logger.warn(`Removed unhealthy service ${serviceName}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to remove unhealthy service ${serviceName}: ${errorMessage}`);
        }
        return false;
      }
      
      return isHealthy;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = (error as { statusCode?: number }).statusCode;
      this.logger.error(`Failed to create service ${serviceName}: ${errorMessage}`);
      if (statusCode === 409) {
        // Service already exists, try to start it
        this.logger.log(`Service ${serviceName} already exists, attempting to start`);
        return await this.startByUserId(userId);
      }
      return false;
    }
  }

  async startByUserId(userId: string): Promise<boolean> {
    const serviceName = this.getServiceNameByUserId(userId);
    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      
      // Check current replica count
      if (inspect.Spec.Mode?.Replicated?.Replicas === 0) {
        // Scale up to 1 replica
        // dockerode handles version automatically from inspect
        await service.update({
          Name: inspect.Spec.Name,
          TaskTemplate: inspect.Spec.TaskTemplate,
          Mode: {
            Replicated: {
              Replicas: 1,
            },
          },
          UpdateConfig: inspect.Spec.UpdateConfig,
          EndpointSpec: inspect.Spec.EndpointSpec,
          Labels: inspect.Spec.Labels,
        });
        this.logger.log(`Scaled service ${serviceName} to 1 replica`);
      }
      
      // Wait for service to be healthy
      const isHealthy = await this.waitUntilHealthy(userId);
      return isHealthy;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start service ${serviceName}: ${errorMessage}`);
      return false;
    }
  }

  async stop(userId: string): Promise<void> {
    const serviceName = this.getServiceNameByUserId(userId);
    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      
      // Scale down to 0 replicas (effectively stops the service)
      // dockerode handles version automatically from inspect
      await service.update({
        Name: inspect.Spec.Name,
        TaskTemplate: inspect.Spec.TaskTemplate,
        Mode: {
          Replicated: {
            Replicas: 0,
          },
        },
        UpdateConfig: inspect.Spec.UpdateConfig,
        EndpointSpec: inspect.Spec.EndpointSpec,
        Labels: inspect.Spec.Labels,
      });
      
      this.logger.log(`Stopped service ${serviceName} by scaling to 0 replicas`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to stop service ${serviceName}: ${errorMessage}`);
      throw error;
    }
  }

  async getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null> {
    const serviceName = this.getServiceNameByUserId(userId);
    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      
      const replicas = inspect.Spec.Mode?.Replicated?.Replicas ?? 0;
      const runningTasks = inspect.ServiceStatus?.RunningTasks ?? 0;
      
      // Service is running if it has replicas > 0 and at least one running task
      if (replicas > 0 && runningTasks > 0) {
        return { state: 'running' };
      }
      
      return { state: 'stopped' };
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return null;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error getting status of service ${serviceName}: ${errorMessage}`);
      return null;
    }
  }

  async waitUntilHealthy(userId: string, options: { timeout?: number, interval?: number } = { timeout: 120000, interval: 5000 }): Promise<boolean> {
    const { timeout = 120000, interval = 5000 } = options;
    const serviceName = this.getServiceNameByUserId(userId);
    const START_TIME = Date.now();
    let elapsedTime = 0;
    
    return await new Promise((resolve, reject) => {
      this.logger.log(`Waiting for service ${serviceName} to be healthy, timeout: ${timeout}, interval: ${interval}`);
      const intervalId = setInterval(async () => {
        try {
          elapsedTime = Date.now() - START_TIME;
          if (elapsedTime > timeout) {
            this.logger.log(`Timeout reached for service ${serviceName}`);
            clearInterval(intervalId);
            this.unregisterInterval(intervalId);
            resolve(false);
            return;
          }
          
          const isHealthy = await this.isHealthy(userId);
          this.logger.log(`Service ${serviceName} is healthy: ${isHealthy}`);
          if (isHealthy) {
            clearInterval(intervalId);
            this.unregisterInterval(intervalId);
            resolve(true);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error checking health of service ${serviceName}: ${errorMessage}`);
          clearInterval(intervalId);
          this.unregisterInterval(intervalId);
          reject(error);
        }
      }, interval);
      this.registerInterval(intervalId);
    });
  }

  // ==================== Private Methods ====================

  /**
   * Setup exit signal handlers to clean up intervals
   */
  private setupExitHandlers(): void {
    const cleanup = () => {
      this.logger.log('Cleaning up active intervals due to exit signal');
      this.clearAllIntervals();
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('SIGUSR2', cleanup);
  }

  /**
   * Clear all active intervals
   */
  private clearAllIntervals(): void {
    const count = this.activeIntervals.size;
    for (const intervalId of this.activeIntervals) {
      clearInterval(intervalId);
    }
    this.activeIntervals.clear();
    if (count > 0) {
      this.logger.log(`Cleared ${count} active intervals`);
    }
  }

  /**
   * Register an interval for cleanup tracking
   */
  private registerInterval(intervalId: NodeJS.Timeout): void {
    this.activeIntervals.add(intervalId);
  }

  /**
   * Unregister an interval from cleanup tracking
   */
  private unregisterInterval(intervalId: NodeJS.Timeout): void {
    this.activeIntervals.delete(intervalId);
  }

  /**
   * Ensure volume exists for the worker (create if it doesn't exist)
   */
  private async ensureVolumeExists(userId: string): Promise<void> {
    const volumeName = `tdlib-${userId}`;
    try {
      const volume = this.docker.getVolume(volumeName);
      await volume.inspect();
      this.logger.debug(`Volume ${volumeName} already exists`);
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        // Volume doesn't exist, create it
        try {
          await this.docker.createVolume({
            Name: volumeName,
            Labels: {
              'tdlib.user': userId,
            },
          });
          this.logger.log(`Created volume ${volumeName} for user ${userId}`);
        } catch (createError: unknown) {
          const errorMessage = createError instanceof Error ? createError.message : String(createError);
          this.logger.error(`Failed to create volume ${volumeName}: ${errorMessage}`);
          throw new Error(`Failed to create volume ${volumeName}: ${errorMessage}`);
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to check volume ${volumeName}: ${errorMessage}`);
        throw error;
      }
    }
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

  private async isHealthy(userId: string): Promise<boolean> {
    const serviceName = this.getServiceNameByUserId(userId);
    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      
      // Quick check: if service has 0 desired replicas, it's not healthy
      const desiredReplicas = inspect.Spec.Mode?.Replicated?.Replicas ?? 0;
      if (desiredReplicas === 0) {
        return false;
      }
      
      // Get tasks for this service to find container ID (necessary to check container health)
      // Note: We check tasks directly instead of relying on ServiceStatus.RunningTasks
      // because ServiceStatus can be stale/cached and may show 0 even when tasks exist
      const tasks = await this.docker.listTasks({
        filters: {
          service: [serviceName],
        },
      });

      this.logger.log(`Found ${tasks.length} tasks for service ${serviceName}`);
      
      // If no tasks exist at all, service is not healthy
      if (tasks.length === 0) {
        return false;
      }
      
      // Log task states for debugging
      tasks.forEach((t, idx) => {
        this.logger.debug(`Task ${idx}: State=${t.Status?.State}, DesiredState=${t.DesiredState}, ContainerID=${t.Status?.ContainerStatus?.ContainerID?.substring(0, 12) ?? 'none'}`);
      });
      
      // Find a running task with a container ID (prefer running tasks)
      // First try to find a running task, then fall back to any task with container ID
      let task = tasks.find(
        (task) => task.Status?.State === 'running' && task.Status?.ContainerStatus?.ContainerID
      );
      
      // If no running task found, try any task with container ID
      if (!task) {
        task = tasks.find(
          (task) => task.Status?.ContainerStatus?.ContainerID
        );
      }
      
      if (!task) {
        this.logger.log(`No task with container ID found for service ${serviceName}. Task states: ${tasks.map(t => t.Status?.State).join(', ')}`);
        return false;
      }
      
      // Get container ID from task and inspect container for health status
      const containerId = task.Status.ContainerStatus.ContainerID;
      const container = this.docker.getContainer(containerId);
      const containerInspect = await container.inspect();
      
      // Check container health status directly - this is what matters
      const healthStatus = containerInspect.State?.Health?.Status;
      
      this.logger.log(`Container ${containerId.substring(0, 12)} health status: ${healthStatus ?? 'no healthcheck'}`);
      
      // Service is healthy if container health status is 'healthy'
      // If no healthcheck is defined, consider running container as healthy
      if (healthStatus === 'healthy') {
        return true;
      } else if (healthStatus === 'unhealthy') {
        return false;
      } else if (!healthStatus && containerInspect.State?.Running) {
        // No healthcheck defined, but container is running - consider healthy
        return true;
      }
      
      // Healthcheck is still starting or container not running
      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error checking health of service ${serviceName}: ${errorMessage}`);
      return false;
    }
  }

  private getServiceNameByUserId(userId: string): string {
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
