import { Injectable } from '@nestjs/common';
import type { PriceTableResultV2 } from '../types/google-sheets.types';

/**
 * Classe abstrata para fornecer dados da tabela de preços (ISP - Interface Segregation Principle)
 * Apenas expõe o que é necessário, não a interface completa do cache
 * Pode ser usada como provider token no NestJS
 */
@Injectable()
export abstract class PriceTableProvider {
  abstract getPriceTable(): Promise<PriceTableResultV2>;
}

