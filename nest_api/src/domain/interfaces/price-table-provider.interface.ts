import { Injectable } from '@nestjs/common';
import type { PriceTableResultV2 } from '../types/google-sheets.types';
import type { PriceTableV2 } from '../types/price.types';

/**
 * Classe abstrata para fornecer dados da tabela de preços (ISP - Interface Segregation Principle)
 * Apenas expõe o que é necessário, não a interface completa do cache
 * Pode ser usada como provider token no NestJS
 */
@Injectable()
export abstract class PriceTableProvider {
  /**
   * Get the price table for a specific program
   * @param userId - User ID
   * @param programId - Program ID
   * @returns Price table for the program or null if not configured
   */
  abstract getPriceTableForProgram(userId: string, programId: number): Promise<PriceTableV2 | null>;

  /**
   * Get the max price (PREÇO TETO) for a specific program
   * @param userId - User ID
   * @param programId - Program ID
   * @returns Max price for the program or null if not configured
   */
  abstract getMaxPriceForProgram(userId: string, programId: number): Promise<number | null>;

  /**
   * Get the available miles for a specific program
   * @param userId - User ID
   * @param programId - Program ID
   * @returns Available miles for the program or null if not configured
   */
  abstract getAvailableMilesForProgram(userId: string, programId: number): Promise<number | null>;

  /**
   * Get all program IDs that the user has configured (has price entries for)
   * @param userId - User ID
   * @returns Array of program IDs
   */
  abstract getConfiguredProgramIds(userId: string): Promise<number[]>;

  /**
   * Check if the user has sufficient miles for the requested quantity
   * @param userId - User ID
   * @param programId - Program ID
   * @param quantity - Required quantity of miles
   * @returns true if user has enough miles, false otherwise
   */
  abstract hasSufficientMiles(userId: string, programId: number, quantity: number): Promise<boolean>;

  /**
   * Get all price table data for a user
   * @deprecated Use granular methods instead (getPriceTableForProgram, getMaxPriceForProgram, etc.)
   */
  abstract getPriceTable(userId: string): Promise<PriceTableResultV2>;
}

