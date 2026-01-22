import { Injectable, Inject } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { WorkerRepository } from '../worker.repository';
import { workerPorts } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of WorkerRepository
 * Single Responsibility: worker port assignments and port allocation state using Drizzle ORM with Neon PostgreSQL
 */
@Injectable()
export class WorkerDrizzleStore extends WorkerRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Get the HTTP port assigned to a worker for a given userId
   */
  async getWorkerPort(userId: string): Promise<number | null> {
    const result = await this.db
      .select({
        port: workerPorts.port,
      })
      .from(workerPorts)
      .where(eq(workerPorts.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0].port;
  }

  /**
   * Set the HTTP port for a worker
   */
  async setWorkerPort(userId: string, port: number): Promise<void> {
    await this.db
      .insert(workerPorts)
      .values({
        userId,
        port,
      })
      .onConflictDoUpdate({
        target: [workerPorts.userId],
        set: {
          port,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get the next available port number
   * Computed by finding the highest assigned port and adding 1, wrapping around if needed
   */
  async getNextPort(): Promise<number | null> {
    const DEFAULT_START_PORT = 5000;
    const MAX_PORT = 6000;

    // Find the highest assigned port
    const result = await this.db
      .select({
        maxPort: sql<number>`MAX(${workerPorts.port})`.as('max_port'),
      })
      .from(workerPorts)
      .limit(1);

    const maxPort = result[0]?.maxPort;

    // If no ports are assigned, start from DEFAULT_START_PORT
    if (!maxPort) {
      return DEFAULT_START_PORT;
    }

    // Compute next port, wrapping around if we exceed MAX_PORT
    let nextPort = maxPort + 1;
    if (nextPort > MAX_PORT) {
      nextPort = DEFAULT_START_PORT;
    }

    return nextPort;
  }

  /**
   * Delete worker port assignment
   */
  async deleteWorkerPort(userId: string): Promise<void> {
    await this.db.delete(workerPorts).where(eq(workerPorts.userId, userId));
  }

  /**
   * Get all worker user IDs that have port assignments
   */
  async getAllWorkers(): Promise<string[]> {
    const result = await this.db
      .select({
        userId: workerPorts.userId,
      })
      .from(workerPorts);

    return result.map((row) => row.userId);
  }
}

