import { Injectable } from '@nestjs/common';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';
import type { PriceTableV2 } from '../../domain/types/price.types';
import { PriceTableProvider } from '../../domain/interfaces/price-table-provider.interface';
import { UserDataRepository } from '../persistence/user-data.repository';

/**
 * Implementação do PriceTableProvider que busca dados do banco de dados
 * Substitui o GoogleSheetsCacheService para usar dados persistidos no PostgreSQL
 */
@Injectable()
export class DatabasePriceTableProvider extends PriceTableProvider {
  constructor(private readonly userDataRepository: UserDataRepository) {
    super();
  }

  /**
   * Get the price table for a specific program
   */
  async getPriceTableForProgram(userId: string, programId: number): Promise<PriceTableV2 | null> {
    const entries = await this.userDataRepository.getPriceEntriesForProgram(userId, programId);
    if (entries.length === 0) {
      return null;
    }
    // Transform entries array to PriceTableV2 (Record<quantity, price>)
    const priceTable: PriceTableV2 = {};
    for (const entry of entries) {
      priceTable[entry.quantity] = entry.price;
    }
    return priceTable;
  }

  /**
   * Get the max price (PREÇO TETO) for a specific program
   */
  async getMaxPriceForProgram(userId: string, programId: number): Promise<number | null> {
    const maxPriceData = await this.userDataRepository.getMaxPriceForProgram(userId, programId);
    return maxPriceData?.maxPrice ?? null;
  }

  /**
   * Get the available miles for a specific program
   */
  async getAvailableMilesForProgram(userId: string, programId: number): Promise<number | null> {
    const milesData = await this.userDataRepository.getAvailableMilesForProgram(userId, programId);
    return milesData?.availableMiles ?? null;
  }

  /**
   * Get all program IDs that the user has configured (has price entries for)
   */
  async getConfiguredProgramIds(userId: string): Promise<number[]> {
    const entries = await this.userDataRepository.getPriceEntries(userId);
    const programIds = new Set(entries.map((entry) => entry.programId));
    return Array.from(programIds);
  }

  /**
   * Check if the user has sufficient miles for the requested quantity
   */
  async hasSufficientMiles(userId: string, programId: number, quantity: number): Promise<boolean> {
    const availableMiles = await this.getAvailableMilesForProgram(userId, programId);
    if (availableMiles === null) {
      return false;
    }
    return availableMiles >= quantity;
  }

  /**
   * Busca a tabela de preços do usuário diretamente do banco de dados
   * @deprecated Use granular methods instead
   * @param userId ID do usuário para buscar os dados
   */
  async getPriceTable(userId: string): Promise<PriceTableResultV2> {
    return this.userDataRepository.getUserPriceTableResult(userId);
  }
}
