export abstract class WorkerManager {
  abstract run(userId: string): Promise<boolean>;
  abstract stop(userId: string): Promise<void>;
  abstract getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null>;
  abstract waitUntilHealthy(userId: string): Promise<boolean>;
}