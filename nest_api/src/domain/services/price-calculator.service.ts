import { Injectable } from '@nestjs/common';
import type { PriceTableV2 } from '../types/price.types';
import type { PriceCalculationResult } from '../types/purchase.types';
import { InterpolationUtil } from '../utils/interpolation.util';

/**
 * Opções para cálculo de preço
 */
export interface CalculatePriceOptions {
  /**
   * Preço máximo customizado. Quando fornecido, o preço calculado não pode exceder este valor.
   */
  customMaxPrice?: number;
}

/**
 * Dados extraídos da tabela de preços para cálculos
 */
interface PriceTableData {
  quantities: number[];
  minQty: number;
  maxQty: number;
  maxPrice: number;
  minPrice: number;
  allPricesSame: boolean;
}

/**
 * Service responsável por calcular preços baseado na tabela de preços
 * Single Responsibility: apenas cálculo de preços
 */
@Injectable()
export class PriceCalculatorService {
  private static readonly DEFAULT_SLOPE = -1 / 30;

  /**
   * Arredonda um número para o quarto mais próximo (0.00, 0.25, 0.50, 0.75)
   */
  private static roundToQuarter(value: number): number {
    return Math.round(value * 4) / 4;
  }

  private static successResult(price: number): PriceCalculationResult {
    return {
      success: true,
      price: PriceCalculatorService.roundToQuarter(price),
    };
  }

  private static errorResult(reason: string): PriceCalculationResult {
    return {
      success: false,
      reason,
    };
  }

  /**
   * Valida os parâmetros de entrada
   */
  private validateInputs(
    quantity: number,
    cpfCount: number,
    priceTable: PriceTableV2,
  ): PriceCalculationResult | null {
    if (quantity <= 0) {
      return PriceCalculatorService.errorResult('Quantidade deve ser maior que zero');
    }
    if (cpfCount <= 0) {
      return PriceCalculatorService.errorResult('Número de CPF deve ser maior que zero');
    }
    const quantities = InterpolationUtil.extractSortedQuantities(priceTable);
    if (quantities.length === 0) {
      return PriceCalculatorService.errorResult('Tabela de preços vazia');
    }
    return null;
  }

  /**
   * Extrai e valida dados da tabela de preços
   */
  private extractPriceTableData(priceTable: PriceTableV2): PriceTableData | PriceCalculationResult {
    const quantities = InterpolationUtil.extractSortedQuantities(priceTable);
    const minQty = quantities[0];
    const maxQty = quantities[quantities.length - 1];

    if (minQty === undefined || maxQty === undefined) {
      return PriceCalculatorService.errorResult('Erro ao processar tabela de preços');
    }

    const maxPrice = priceTable[minQty];
    const minPrice = priceTable[maxQty];

    if (minPrice === undefined || maxPrice === undefined) {
      return PriceCalculatorService.errorResult('Preços mínimo ou máximo não encontrados');
    }

    const allPricesSame = quantities.every((qty) => priceTable[qty] === maxPrice);

    return {
      quantities,
      minQty,
      maxQty,
      maxPrice,
      minPrice,
      allPricesSame,
    };
  }

  /**
   * Calcula o slope (inclinação) entre os dois primeiros pontos da tabela
   */
  private calculateSlope(priceTable: PriceTableV2, quantities: number[]): number | null {
    if (quantities.length < 2) return null;

    const minQty = quantities[0];
    const secondQty = quantities[1];

    if (minQty === undefined || secondQty === undefined) {
      return null;
    }

    const maxPrice = priceTable[minQty];
    const secondPrice = priceTable[secondQty];

    if (maxPrice === undefined || secondPrice === undefined) {
      return null;
    }

    return (secondPrice - maxPrice) / (secondQty - minQty);
  }

  /**
   * Calcula o slope a ser usado na extrapolação
   */
  private getExtrapolationSlope(
    priceTable: PriceTableV2,
    quantities: number[],
    allPricesSame: boolean,
  ): number {
    if (allPricesSame && quantities.length >= 3) {
      return PriceCalculatorService.DEFAULT_SLOPE;
    }
    return this.calculateSlope(priceTable, quantities) ?? PriceCalculatorService.DEFAULT_SLOPE;
  }

  /**
   * Calcula o preço usando extrapolação linear para quantidades abaixo do mínimo
   */
  private extrapolatePrice(
    quantityPerCpf: number,
    minQty: number,
    maxPrice: number,
    priceTable: PriceTableV2,
    quantities: number[],
    allPricesSame: boolean,
  ): number {
    const slope = this.getExtrapolationSlope(priceTable, quantities, allPricesSame);
    return maxPrice + slope * (quantityPerCpf - minQty);
  }

  /**
   * Aplica limites de preço para múltiplos CPFs sem customMaxPrice
   */
  private applyPriceLimits(price: number, maxPrice: number, minPrice: number): number {
    return Math.max(Math.min(price, maxPrice), minPrice);
  }

  /**
   * Calcula preço quando quantidade está exatamente no mínimo
   */
  private calculatePriceAtMinimum(
    maxPrice: number,
    customMaxPrice?: number,
  ): PriceCalculationResult {
    const finalPrice = customMaxPrice !== undefined ? Math.min(maxPrice, customMaxPrice) : maxPrice;
    return PriceCalculatorService.successResult(finalPrice);
  }

  /**
   * Calcula preço quando quantidade está abaixo do mínimo (extrapolação)
   */
  private calculatePriceBelowMinimum(
    quantityPerCpf: number,
    cpfCount: number,
    tableData: PriceTableData,
    priceTable: PriceTableV2,
    customMaxPrice?: number,
  ): PriceCalculationResult {
    const { minQty, maxPrice, minPrice, quantities, allPricesSame } = tableData;

    if (allPricesSame && quantities.length === 2 && customMaxPrice === undefined) {
      return PriceCalculatorService.successResult(maxPrice);
    }

    const extrapolatedPrice = this.extrapolatePrice(
      quantityPerCpf,
      minQty,
      maxPrice,
      priceTable,
      quantities,
      allPricesSame,
    );

    if (customMaxPrice !== undefined) {
      return PriceCalculatorService.successResult(Math.min(extrapolatedPrice, customMaxPrice));
    }

    if (cpfCount === 1) {
      return PriceCalculatorService.successResult(maxPrice);
    }

    const finalPrice = this.applyPriceLimits(extrapolatedPrice, maxPrice, minPrice);
    return PriceCalculatorService.successResult(finalPrice);
  }

  /**
   * Calcula preço quando quantidade está acima do máximo
   */
  private calculatePriceAboveMaximum(minPrice: number): PriceCalculationResult {
    return PriceCalculatorService.successResult(minPrice);
  }

  /**
   * Calcula preço quando quantidade está dentro do intervalo (interpolação)
   */
  private calculatePriceInRange(
    quantityPerCpf: number,
    quantities: number[],
    priceTable: PriceTableV2,
    minPrice: number,
  ): PriceCalculationResult {
    const points = InterpolationUtil.findInterpolationPoints(quantityPerCpf, quantities);
    if (!points) {
      return PriceCalculatorService.errorResult(
        'Não foi possível encontrar pontos para interpolação',
      );
    }

    const lowerPrice = priceTable[points.lower];
    const upperPrice = priceTable[points.upper];

    if (lowerPrice === undefined || upperPrice === undefined) {
      return PriceCalculatorService.errorResult('Preços para interpolação não encontrados');
    }

    if (lowerPrice === upperPrice) {
      return PriceCalculatorService.successResult(lowerPrice);
    }

    const interpolatedPrice = InterpolationUtil.linearInterpolation(
      quantityPerCpf,
      points.lower,
      lowerPrice,
      points.upper,
      upperPrice,
    );

    const finalPrice = Math.max(interpolatedPrice, minPrice);
    return PriceCalculatorService.successResult(finalPrice);
  }

  /**
   * Calcula o preço usando interpolação linear baseado na tabela de preços v2
   */
  calculate(
    quantity: number,
    cpfCount: number,
    priceTable: PriceTableV2,
    options?: CalculatePriceOptions,
  ): PriceCalculationResult {
    const validationError = this.validateInputs(quantity, cpfCount, priceTable);
    if (validationError) {
      return validationError;
    }

    const tableDataOrError = this.extractPriceTableData(priceTable);
    if (!('quantities' in tableDataOrError)) {
      return tableDataOrError;
    }
    const tableData = tableDataOrError;

    const quantityPerCpf = quantity / cpfCount;
    const { minQty, maxQty, minPrice } = tableData;

    if (quantityPerCpf === minQty) {
      return this.calculatePriceAtMinimum(tableData.maxPrice, options?.customMaxPrice);
    }

    if (quantityPerCpf < minQty) {
      return this.calculatePriceBelowMinimum(
        quantityPerCpf,
        cpfCount,
        tableData,
        priceTable,
        options?.customMaxPrice,
      );
    }

    if (quantityPerCpf >= maxQty) {
      return this.calculatePriceAboveMaximum(minPrice);
    }

    return this.calculatePriceInRange(quantityPerCpf, tableData.quantities, priceTable, minPrice);
  }
}
