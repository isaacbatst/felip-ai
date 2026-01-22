/**
 * Abstract repository for worker data operations
 * Handles persistence of worker ports and port allocation state
 */
export abstract class WorkerRepository {
  /**
   * Get the HTTP port assigned to a worker for a given userId
   */
  abstract getWorkerPort(userId: string): Promise<number | null>;

  /**
   * Set the HTTP port for a worker
   */
  abstract setWorkerPort(userId: string, port: number): Promise<void>;

  /**
   * Get the next available port number
   */
  abstract getNextPort(): Promise<number | null>;

  /**
   * Delete worker port assignment
   */
  abstract deleteWorkerPort(userId: string): Promise<void>;

  /**
   * Get all worker user IDs that have port assignments
   */
  abstract getAllWorkers(): Promise<string[]>;
}

