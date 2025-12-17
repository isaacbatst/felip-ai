export abstract class WorkerManager {
  abstract start(userId: string): Promise<void>;
  abstract stop(userId: string): Promise<void>;
  abstract getStatus(userId: string): Promise<{ state: 'running' | 'stopped' } | null>;
}