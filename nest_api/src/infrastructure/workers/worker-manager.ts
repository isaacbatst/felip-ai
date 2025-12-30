export abstract class WorkerManager {
  /**
   * Runs the worker awaits until the worker is healthy
   * @param userId - The user ID to run the worker for
   * @returns True if the worker was started successfully, false otherwise
   */
  abstract run(userId: string): Promise<boolean>;
  abstract stop(userId: string): Promise<void>;
  abstract getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null>;
  abstract waitUntilHealthy(userId: string): Promise<boolean>;
  abstract getWorkerPort(userId: string): Promise<number | null>;
  abstract getHostname(userId: string): Promise<string>;
}