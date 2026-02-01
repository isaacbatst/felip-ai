/**
 * Miles program data structure
 */
export interface MilesProgramData {
  id: number;
  name: string;
  liminarOfId: number | null;
  createdAt: Date;
}

/**
 * Miles program with its liminar version (if exists)
 */
export interface MilesProgramWithLiminar extends MilesProgramData {
  liminarVersion: MilesProgramData | null;
}

/**
 * Abstract repository for miles program operations
 */
export abstract class MilesProgramRepository {
  /**
   * Get all miles programs
   */
  abstract getAllPrograms(): Promise<MilesProgramData[]>;

  /**
   * Get all programs with their liminar versions
   */
  abstract getAllProgramsWithLiminar(): Promise<MilesProgramWithLiminar[]>;

  /**
   * Get a program by ID
   */
  abstract getProgramById(id: number): Promise<MilesProgramData | null>;

  /**
   * Get a program by name (case-insensitive)
   */
  abstract getProgramByName(name: string): Promise<MilesProgramData | null>;

  /**
   * Find the liminar version of a program
   * @param programId - The normal program ID
   * @returns The liminar program if exists, null otherwise
   */
  abstract findLiminarFor(programId: number): Promise<MilesProgramData | null>;

  /**
   * Create a new miles program
   * @param name - Program name
   * @param liminarOfId - If this is a liminar version, the ID of the normal program
   */
  abstract createProgram(name: string, liminarOfId?: number): Promise<MilesProgramData>;

  /**
   * Update a program name
   */
  abstract updateProgram(id: number, name: string): Promise<MilesProgramData | null>;

  /**
   * Delete a program
   */
  abstract deleteProgram(id: number): Promise<boolean>;
}
