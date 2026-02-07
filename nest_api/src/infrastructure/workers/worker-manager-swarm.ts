import { AppConfigService } from '@/config/app.config';
import { WorkerRepository } from '@/infrastructure/persistence/worker.repository';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Docker from 'dockerode';
import fs from 'node:fs';

@Injectable()
export class WorkerManagerSwarm extends WorkerManager implements OnModuleDestroy, OnModuleInit {
  private docker = new Docker();
  private readonly logger = new Logger(WorkerManagerSwarm.name);
  private readonly activeIntervals = new Set<NodeJS.Timeout>();
  // Network ID for RabbitMQ network (felip-ai_default)
  private readonly RABBITMQ_NETWORK_ID = 'z4co2okrw1ep6848qtmssfotf';
  // Cache for current image digest to avoid unnecessary pulls
  private currentImageDigest: string | null = null;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly workerRepository: WorkerRepository,
  ) {
    super();
    this.setupExitHandlers();
  }

  // ==================== Public Methods ====================

  async onModuleInit(): Promise<void> {
    this.logger.log('WorkerManagerSwarm module initialized');
    
    // Check and recreate workers that exist in repository but not in Docker Swarm
    await this.verifyAndRecreateWorkers();
  }

  /**
   * Verifies that all workers in the repository have corresponding Docker services
   * Recreates any missing services
   */
  private async verifyAndRecreateWorkers(): Promise<void> {
    this.logger.log('Verifying workers from repository...');
    
    try {
      // Get all workers from repository
      const workers = await this.workerRepository.getAllWorkers();
      this.logger.log(`Found ${workers.length} workers in repository`);
      
      if (workers.length === 0) {
        this.logger.log('No workers found in repository, skipping verification');
        return;
      }

      // Check each worker and recreate if service doesn't exist
      const recreatePromises = workers.map(async (userId) => {
        try {
          const status = await this.getStatus(userId);
          
          if (!status) {
            // Service doesn't exist, recreate it
            this.logger.log(`Worker ${userId} exists in repository but service doesn't exist, recreating...`);
            const success = await this.run(userId);
            if (success) {
              this.logger.log(`Successfully recreated service for worker ${userId}`);
            } else {
              this.logger.error(`Failed to recreate service for worker ${userId}`);
            }
          } else {
            this.logger.debug(`Worker ${userId} service exists (state: ${status.state})`);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error verifying worker ${userId}: ${errorMessage}`);
          // Continue with other workers even if one fails
        }
      });

      await Promise.allSettled(recreatePromises);
      this.logger.log('Finished verifying workers from repository');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error verifying workers from repository: ${errorMessage}`);
      // Don't throw - allow application to start even if verification fails
    }
  }

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
    
    // Check if service exists and is on the correct network
    if (status) {
      const isOnCorrectNetwork = await this.isServiceOnCorrectNetwork(userId);
      if (!isOnCorrectNetwork) {
        this.logger.warn(`Service ${serviceName} is on wrong network, will recreate it`);
        // Remove the service so it can be recreated with correct network
        try {
          const service = this.docker.getService(serviceName);
          await service.remove();
          this.logger.log(`Removed service ${serviceName} to recreate with correct network`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to remove service ${serviceName}: ${errorMessage}`);
        }
        // Continue to create new service below
      } else if (status.state === 'running') {
        this.logger.log(`Service for user ${userId} is already running`);
        return true;
      } else if (status.state === 'stopped') {
        return await this.startByUserId(userId);
      }
    }

    // Service doesn't exist, create it
    this.logger.log(`Creating service ${serviceName}`);
    
    // Ensure volume exists before creating service
    await this.ensureVolumeExists(userId);
    
    this.logger.log(`Creating service ${serviceName} on network ${this.RABBITMQ_NETWORK_ID}`);
    
    const envVars = await this.getEnvFromPath(this.appConfigService.getWorkerEnvFile());
    // Add USER_ID to environment variables so worker knows which queue to listen to
    envVars.push(`USER_ID=${userId}`);
    // Assign and set HTTP port for this worker
    const httpPort = await this.getPortForWorker(userId);
    envVars.push(`HTTP_PORT=${httpPort}`);
    // Override RABBITMQ_HOST to use the full service name
    // Remove any existing RABBITMQ_HOST from envVars first
    const filteredEnvVars = envVars.filter(env => !env.startsWith('RABBITMQ_HOST='));
    filteredEnvVars.push(`RABBITMQ_HOST=felip-ai_rabbitmq`);
    filteredEnvVars.push(`TELEGRAM_DATABASE_DIRECTORY=/app/tdlib_worker/_td_database`);
    filteredEnvVars.push(`TELEGRAM_FILES_DIRECTORY=/app/tdlib_worker/_td_files`);
    this.logger.log(`Environment variables: ${JSON.stringify(filteredEnvVars)}`);

    try {
      await this.docker.createService({
        Name: serviceName,
        TaskTemplate: {
          Networks: [
            {
              Target: this.RABBITMQ_NETWORK_ID,
            }
          ],
          ContainerSpec: {
            Image: this.getImageName(),
            Env: filteredEnvVars,
            Mounts: [
              {
                Type: 'volume',
                Source: `felip-tdlib-${userId}`,
                Target: '/app/tdlib_worker/_td_database',
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
          Order: 'stop-first',
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
      
      // Ensure service is on the correct network
      const currentNetworks = inspect.Spec.TaskTemplate?.Networks || [];
      const isOnCorrectNetwork = currentNetworks.some(n => n.Target === this.RABBITMQ_NETWORK_ID);
      
      this.logger.log(`Service ${serviceName} current networks: ${JSON.stringify(currentNetworks.map(n => n.Target))}`);
      this.logger.log(`Service ${serviceName} is on correct network: ${isOnCorrectNetwork}`);
      
      // Update environment variables to ensure RABBITMQ_HOST is correct
      const currentEnv = inspect.Spec.TaskTemplate?.ContainerSpec?.Env || [];
      const updatedEnv = currentEnv.filter(env => !env.startsWith('RABBITMQ_HOST='));
      updatedEnv.push(`RABBITMQ_HOST=felip-ai_rabbitmq`);
      
      // Update TaskTemplate with correct network and env
      // Explicitly set Networks to ensure it's correct
      const updatedTaskTemplate = {
        ...inspect.Spec.TaskTemplate,
        Networks: [{ Target: this.RABBITMQ_NETWORK_ID }], // Always set to correct network
        ContainerSpec: {
          ...inspect.Spec.TaskTemplate?.ContainerSpec,
          Env: updatedEnv,
        },
      };
      
      // Check current replica count
      if (inspect.Spec.Mode?.Replicated?.Replicas === 0 || !isOnCorrectNetwork) {
        // Scale up to 1 replica and/or update network
        await service.update({
          Name: inspect.Spec.Name,
          TaskTemplate: updatedTaskTemplate,
          Mode: {
            Replicated: {
              Replicas: 1,
            },
          },
          UpdateConfig: inspect.Spec.UpdateConfig,
          EndpointSpec: inspect.Spec.EndpointSpec,
          Labels: inspect.Spec.Labels,
          version: inspect.Version?.Index,
        });
        if (!isOnCorrectNetwork) {
          this.logger.log(`Updated service ${serviceName} network to ${this.RABBITMQ_NETWORK_ID}`);
        }
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
        version: inspect.Version?.Index,
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
      if (replicas === 0) {
        return { state: 'stopped' };
      }

      // Use listTasks instead of ServiceStatus.RunningTasks (which is stale/cached)
      const tasks = await this.docker.listTasks({
        filters: { service: [serviceName] },
      });

      const hasRunningTask = tasks.some(
        (task) => task.Status?.State === 'running' && task.DesiredState === 'running',
      );

      return { state: hasRunningTask ? 'running' : 'stopped' };
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
   * Check if a service is on the correct network (same as RabbitMQ)
   */
  private async isServiceOnCorrectNetwork(userId: string): Promise<boolean> {
    try {
      const serviceName = this.getServiceNameByUserId(userId);
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      const currentNetworks = inspect.Spec.TaskTemplate?.Networks || [];
      return currentNetworks.some(n => n.Target === this.RABBITMQ_NETWORK_ID);
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return false; // Service doesn't exist
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error checking network for service: ${errorMessage}`);
      return false;
    }
  }

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
    const volumeName = `felip-tdlib-${userId}`;
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
    await this.workerRepository.setWorkerPort(userId, nextPort);
    
    this.logger.log(`Assigned port ${nextPort} to worker for user ${userId}`);
    return nextPort;
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
    return 'isaacbatst/tdlib-worker:prod';
  }

  private async getEnvFromPath(path: string): Promise<string[]> {
    const content = await fs.promises.readFile(path, 'utf8');
    return content.split('\n').filter((line) => line.trim() !== '');
  }

  async getHostname(userId: string): Promise<string> {
    return `tdlib-${userId}`;
  }

  // ==================== Image Update Methods ====================

  /**
   * Cron job that runs every hour to check for new image versions
   * Format: CronExpression.EVERY_HOUR = '0 * * * *'
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndUpdateImage(): Promise<void> {
    this.logger.log('Starting image update check...');
    try {
      const hasNewImage = await this.checkForNewImage();
      if (hasNewImage) {
        this.logger.log('New image version detected, updating services...');
        await this.updateAllServices();
      } else {
        this.logger.log('No new image version found');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error checking for image updates: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
    }
  }

  /**
   * Checks if there's a new version of the image available
   * Returns true if a new version is available, false otherwise
   */
  private async checkForNewImage(): Promise<boolean> {
    const imageName = this.getImageName();
    this.logger.log(`Checking for new version of image: ${imageName}`);

    try {
      // Get current digest before pull (if image exists locally)
      let oldDigest: string | null = null;
      try {
        const existingImage = this.docker.getImage(imageName);
        const existingInspect = await existingImage.inspect();
        const repoDigests = existingInspect.RepoDigests || [];
        oldDigest = repoDigests.length > 0 
          ? repoDigests[0].split('@')[1]
          : existingInspect.Id;
      } catch {
        // Image doesn't exist locally, that's fine
        this.logger.log('Image not found locally, will pull');
      }

      // Pull the latest image (this will download if there's a new version)
      this.logger.log(`Pulling image ${imageName}...`);
      const pullStream = await this.docker.pull(imageName);
      
      let pullResult: { hasNewImage: boolean; statusMessages: string[] } = { hasNewImage: false, statusMessages: [] };
      
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(pullStream, (err: Error | null, output: unknown[]) => {
          if (err) {
            reject(err);
            return;
          }
          // Log pull progress
          const statusMessages = output
            .filter((item: unknown) => typeof item === 'object' && item !== null && 'status' in item)
            .map((item) => {
              if (typeof item.status !== 'string') {
                return '';
              }
              if (item.status?.match(/Image is up to date/i)) {
                return 'Image is up to date';
              }
              if (item.status?.match(/Downloaded newer image/i)) {
                return 'Downloaded newer image';
              }
              return item.status || '';
            });
          
          const hasNewImage = statusMessages.some(msg => msg.includes('Downloaded newer image'));
          pullResult = { hasNewImage, statusMessages };
          
          if (hasNewImage) {
            this.logger.log('New image version downloaded');
          } else if (statusMessages.some(msg => msg.includes('Image is up to date'))) {
            this.logger.log('Image is already up to date');
          }
          
          resolve();
        });
      });

      // Inspect the image to get its digest after pull
      const image = this.docker.getImage(imageName);
      const imageInspect = await image.inspect();
      
      // Get the digest from the image inspect
      // Digest format: sha256:xxxxx (from RepoDigests)
      const repoDigests = imageInspect.RepoDigests || [];
      const newDigest = repoDigests.length > 0 
        ? repoDigests[0].split('@')[1] // Extract digest part after @
        : imageInspect.Id; // Fallback to image ID

      if (!newDigest) {
        this.logger.warn('Could not determine image digest, skipping update check');
        return false;
      }

      // Use cached digest if available, otherwise use oldDigest from inspect
      const previousDigest = this.currentImageDigest || oldDigest;

      // If image didn't exist locally (oldDigest === null), it was just downloaded
      // In this case, we should update services even on first check
      const imageWasJustDownloaded = oldDigest === null;
      
      // If this is the first check ever (no cached digest and no old digest)
      if (previousDigest === null) {
        this.logger.log(`First check - caching digest: ${newDigest.substring(0, 20)}...`);
        this.currentImageDigest = newDigest;
        
        // If image was just downloaded (didn't exist locally), update services
        if (imageWasJustDownloaded) {
          this.logger.log('Image was downloaded for the first time (did not exist locally), updating services...');
          return true;
        }
        
        // Otherwise, don't update on first check (image already existed locally)
        this.logger.log('First check - image already existed locally, skipping update');
        return false;
      }

      // Compare digests or check if new image was downloaded
      if (previousDigest !== newDigest || pullResult.hasNewImage) {
        this.logger.log(`New image detected! Old: ${previousDigest?.substring(0, 20) || 'none'}..., New: ${newDigest.substring(0, 20)}...`);
        this.currentImageDigest = newDigest;
        return true;
      }

      this.logger.log('Image digest unchanged, no update needed');
      return false;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error checking for new image: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Lists all active services that use the worker image
   */
  private async listActiveServices(): Promise<Array<{ serviceName: string; userId: string }>> {
    try {
      const imageName = this.getImageName();
      const imageNameWithoutTag = imageName.split(':')[0];
      const services = await this.docker.listServices({
        filters: {
          label: ['tdlib.user'],
        },
      });

      const activeServices: Array<{ serviceName: string; userId: string }> = [];

      for (const service of services) {
        try {
          const serviceObj = this.docker.getService(service.ID);
          const inspect = await serviceObj.inspect();
          
          // Check if service uses our image
          const serviceImage = inspect.Spec.TaskTemplate?.ContainerSpec?.Image;
          if (serviceImage?.startsWith(imageNameWithoutTag)) {
            // Extract userId from service name (format: tdlib-{userId})
            const serviceName = inspect.Spec.Name || service.ID;
            const userId = serviceName.replace(/^tdlib-/, '');
            
            // Check if service is running (has replicas > 0)
            const replicas = inspect.Spec.Mode?.Replicated?.Replicas ?? 0;
            if (replicas > 0) {
              activeServices.push({ serviceName, userId });
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Error inspecting service ${service.ID}: ${errorMessage}`);
          // Continue with next service
        }
      }

      this.logger.log(`Found ${activeServices.length} active services using image ${imageNameWithoutTag}`);
      return activeServices;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error listing active services: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Updates all active services to use the new image
   */
  private async updateAllServices(): Promise<void> {
    const activeServices = await this.listActiveServices();
    
    if (activeServices.length === 0) {
      this.logger.log('No active services to update');
      return;
    }

    this.logger.log(`Updating ${activeServices.length} services...`);

    const updatePromises = activeServices.map(async ({ serviceName, userId }) => {
      try {
        await this.updateService(userId);
        this.logger.log(`Successfully updated service ${serviceName}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to update service ${serviceName}: ${errorMessage}`);
        // Continue updating other services even if one fails
      }
    });

    await Promise.allSettled(updatePromises);
    this.logger.log('Finished updating all services');
  }

  /**
   * Updates a single service to use the new image
   * Uses Docker Swarm service update API with version index
   */
  private async updateService(userId: string): Promise<void> {
    const serviceName = this.getServiceNameByUserId(userId);
    this.logger.log(`Updating service ${serviceName} with new image...`);

    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();

      // Get current spec and version
      const currentSpec = inspect.Spec;
      const version = inspect.Version?.Index;
      
      if (version === undefined || version === null || typeof version !== 'number') {
        this.logger.error(`Service ${serviceName} version: ${JSON.stringify(inspect.Version)}`);
        throw new Error(`Service ${serviceName} does not have a valid version index. Got: ${version}`);
      }

      this.logger.log(`Service ${serviceName} current version: ${version} (type: ${typeof version})`);
      
      // Get current ForceUpdate value (defaults to 0)
      const currentForceUpdate = currentSpec.TaskTemplate?.ForceUpdate ?? 0;
      this.logger.log(`Service ${serviceName} current ForceUpdate: ${currentForceUpdate}`);
      
      // Update the image in TaskTemplate and increment ForceUpdate to force task recreation
      const updatedTaskTemplate = {
        ...currentSpec.TaskTemplate,
        ContainerSpec: {
          ...currentSpec.TaskTemplate?.ContainerSpec,
          Image: this.getImageName(), // This will use the newly pulled image
        },
        ForceUpdate: currentForceUpdate + 1, // Force task recreation even if spec hasn't changed
      };

      const updateSpec = {
        Name: currentSpec.Name,
        TaskTemplate: updatedTaskTemplate,
        Mode: currentSpec.Mode,
        UpdateConfig: currentSpec.UpdateConfig,
        EndpointSpec: currentSpec.EndpointSpec,
        Labels: currentSpec.Labels,
        version: version,
      };

      await service.update(updateSpec)

      this.logger.log(`Service ${serviceName} update initiated with version ${version}, ForceUpdate: ${currentForceUpdate} -> ${currentForceUpdate + 1}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the service is still healthy after update
      const isHealthy = await this.waitUntilHealthy(userId, { timeout: 120000, interval: 5000 });
      if (isHealthy) {
        this.logger.log(`Service ${serviceName} is healthy after update`);
      } else {
        this.logger.warn(`Service ${serviceName} may not be healthy after update`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error updating service ${serviceName}: ${errorMessage}`);
      throw error;
    }
  }
}
