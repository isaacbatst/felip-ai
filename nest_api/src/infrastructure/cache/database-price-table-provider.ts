import { Injectable } from '@nestjs/common';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';
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
   * Busca a tabela de preços do usuário diretamente do banco de dados
   * @param userId ID do usuário para buscar os dados
   */
  async getPriceTable(userId: string): Promise<PriceTableResultV2> {
    return this.userDataRepository.getUserPriceTableResult(userId);
  }
}
