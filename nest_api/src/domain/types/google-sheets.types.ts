import type { MilesProgram } from './miles-program.types';
import type { Provider } from './provider.types';
import type { PriceTableV2 } from './price.types';

/**
 * Resultado da busca na planilha v2 incluindo tabelas de preços v2 por provedor e milhas disponíveis por programa
 */
export interface PriceTableResultV2 {
  /**
   * Tabelas de preços organizadas por provedor
   * Cada provedor tem sua própria tabela de preços
   */
  priceTables: Record<Provider, PriceTableV2>;
  availableMiles: Record<MilesProgram, number | null>;
  /**
   * Preço máximo customizado (PREÇO TETO) por provedor
   * Quando fornecido, o preço calculado não pode exceder este valor para o provedor específico
   * Se não houver PREÇO TETO específico para um provedor, pode ser undefined
   */
  customMaxPrice: Record<Provider, number | undefined>;
}

