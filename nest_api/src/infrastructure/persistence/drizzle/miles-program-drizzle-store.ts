import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  MilesProgramRepository,
  MilesProgramData,
  MilesProgramWithLiminar,
} from '../miles-program.repository';
import { milesPrograms } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

const DEFAULT_PROGRAMS: { name: string; liminarOf?: string }[] = [
  { name: 'SMILES' },
  { name: 'LATAM' },
  { name: 'AZUL/TUDO AZUL' },
  { name: 'SMILES LIMINAR', liminarOf: 'SMILES' },
  { name: 'LATAM LIMINAR', liminarOf: 'LATAM' },
  { name: 'AZUL LIMINAR', liminarOf: 'AZUL/TUDO AZUL' },
];

@Injectable()
export class MilesProgramDrizzleStore extends MilesProgramRepository {
  private readonly logger = new Logger(MilesProgramDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Map database row to MilesProgramData
   */
  private mapToMilesProgramData(row: typeof milesPrograms.$inferSelect): MilesProgramData {
    return {
      id: row.id,
      name: row.name,
      liminarOfId: row.liminarOfId,
      createdAt: row.createdAt,
    };
  }

  /**
   * Get all miles programs
   */
  async getAllPrograms(): Promise<MilesProgramData[]> {
    const result = await this.db.select().from(milesPrograms);
    return result.map(this.mapToMilesProgramData);
  }

  /**
   * Get all programs with their liminar versions
   */
  async getAllProgramsWithLiminar(): Promise<MilesProgramWithLiminar[]> {
    // Get all normal programs (liminarOfId is null)
    const normalPrograms = await this.db
      .select()
      .from(milesPrograms)
      .where(isNull(milesPrograms.liminarOfId));

    // Get all liminar programs
    const liminarPrograms = await this.db
      .select()
      .from(milesPrograms)
      .where(eq(milesPrograms.liminarOfId, milesPrograms.liminarOfId)); // This gets all where liminarOfId is not null

    // Actually let's get all programs and filter in memory
    const allPrograms = await this.db.select().from(milesPrograms);
    
    const liminarMap = new Map<number, MilesProgramData>();
    const normalList: MilesProgramData[] = [];

    for (const program of allPrograms) {
      const data = this.mapToMilesProgramData(program);
      if (program.liminarOfId !== null) {
        liminarMap.set(program.liminarOfId, data);
      } else {
        normalList.push(data);
      }
    }

    return normalList.map((program) => ({
      ...program,
      liminarVersion: liminarMap.get(program.id) ?? null,
    }));
  }

  /**
   * Get a program by ID
   */
  async getProgramById(id: number): Promise<MilesProgramData | null> {
    const result = await this.db
      .select()
      .from(milesPrograms)
      .where(eq(milesPrograms.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToMilesProgramData(result[0]);
  }

  /**
   * Get a program by name (case-insensitive)
   */
  async getProgramByName(name: string): Promise<MilesProgramData | null> {
    // PostgreSQL ILIKE for case-insensitive search
    const result = await this.db
      .select()
      .from(milesPrograms)
      .where(eq(milesPrograms.name, name.toUpperCase().trim()))
      .limit(1);

    if (result.length === 0) {
      // Try exact match
      const exactResult = await this.db
        .select()
        .from(milesPrograms)
        .where(eq(milesPrograms.name, name.trim()))
        .limit(1);

      if (exactResult.length === 0) {
        return null;
      }
      return this.mapToMilesProgramData(exactResult[0]);
    }

    return this.mapToMilesProgramData(result[0]);
  }

  /**
   * Find the liminar version of a program
   */
  async findLiminarFor(programId: number): Promise<MilesProgramData | null> {
    const result = await this.db
      .select()
      .from(milesPrograms)
      .where(eq(milesPrograms.liminarOfId, programId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToMilesProgramData(result[0]);
  }

  /**
   * Create a new miles program
   */
  async createProgram(name: string, liminarOfId?: number): Promise<MilesProgramData> {
    const result = await this.db
      .insert(milesPrograms)
      .values({
        name: name.trim(),
        liminarOfId: liminarOfId ?? null,
      })
      .returning();

    return this.mapToMilesProgramData(result[0]);
  }

  /**
   * Update a program name
   */
  async updateProgram(id: number, name: string): Promise<MilesProgramData | null> {
    const result = await this.db
      .update(milesPrograms)
      .set({ name: name.trim() })
      .where(eq(milesPrograms.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    return this.mapToMilesProgramData(result[0]);
  }

  /**
   * Delete a program
   */
  async deleteProgram(id: number): Promise<boolean> {
    const result = await this.db
      .delete(milesPrograms)
      .where(eq(milesPrograms.id, id))
      .returning({ id: milesPrograms.id });

    return result.length > 0;
  }

  async seedDefaultPrograms(): Promise<void> {
    // Seed normal programs first
    for (const program of DEFAULT_PROGRAMS.filter((p) => !p.liminarOf)) {
      const existing = await this.getProgramByName(program.name);
      if (!existing) {
        await this.createProgram(program.name);
        this.logger.log(`Seeded miles program: ${program.name}`);
      }
    }

    // Seed liminar programs (need parent IDs)
    for (const program of DEFAULT_PROGRAMS.filter((p) => p.liminarOf)) {
      const existing = await this.getProgramByName(program.name);
      if (!existing) {
        const parent = await this.getProgramByName(program.liminarOf!);
        if (parent) {
          await this.createProgram(program.name, parent.id);
          this.logger.log(`Seeded miles program: ${program.name}`);
        }
      }
    }
  }
}
