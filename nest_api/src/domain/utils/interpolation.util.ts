import type { PriceTable } from '../types/price.types';

/**
 * Encontra os dois pontos mais próximos para interpolação
 */
export class InterpolationUtil {
  static findInterpolationPoints(
    quantity: number,
    quantities: number[],
  ): { lower: number; upper: number } | null {
    if (quantities.length < 2) {
      return null;
    }

    for (let i = 0; i < quantities.length - 1; i++) {
      const currentQty = quantities[i];
      const nextQty = quantities[i + 1];

      if (
        currentQty !== undefined &&
        nextQty !== undefined &&
        quantity >= currentQty &&
        quantity <= nextQty
      ) {
        return { lower: currentQty, upper: nextQty };
      }
    }

    return null;
  }

  /**
   * Calcula interpolação linear entre dois pontos
   */
  static linearInterpolation(x: number, x1: number, y1: number, x2: number, y2: number): number {
    const ratio = (x - x1) / (x2 - x1);
    return y1 + (y2 - y1) * ratio;
  }

  /**
   * Extrai e ordena as quantidades de uma tabela de preços
   */
  static extractSortedQuantities(table: PriceTable): number[] {
    return Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b)
      .filter((qty) => !Number.isNaN(qty));
  }
}

