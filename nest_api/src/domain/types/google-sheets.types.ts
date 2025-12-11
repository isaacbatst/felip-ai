import type { MilesProgram } from './miles-program.types';
import type { PriceTableV2 } from './price.types';

/**
 * Resultado da busca na planilha v2 incluindo tabela de preços v2 e milhas disponíveis por programa
 */
export interface PriceTableResultV2 {
  priceTable: PriceTableV2;
  availableMiles: Record<MilesProgram, number | null>;
  /**
   * Preço máximo customizado opcional lido da célula C2
   * Quando fornecido, o preço calculado não pode exceder este valor
   */
  customMaxPrice?: number | undefined;
}
