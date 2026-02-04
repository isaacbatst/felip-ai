import { Injectable, Logger } from '@nestjs/common';
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
  /** Maior preço na tabela (valor máximo entre todos os preços) */
  maxPrice: number;
  /** Menor preço na tabela (valor mínimo entre todos os preços) */
  minPrice: number;
  /** Preço na menor quantidade (priceTable[minQty]) */
  priceAtMinQty: number;
  /** Preço na maior quantidade (priceTable[maxQty]) */
  priceAtMaxQty: number;
  allPricesSame: boolean;
}

/**
 * Service responsável por calcular preços baseado na tabela de preços
 * Single Responsibility: apenas cálculo de preços
 */
@Injectable()
export class PriceCalculatorService {
  private readonly logger = new Logger(PriceCalculatorService.name);
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
      this.logger.warn('Validation failed: quantity must be greater than zero', { quantity });
      return PriceCalculatorService.errorResult('Quantidade deve ser maior que zero');
    }
    if (cpfCount <= 0) {
      this.logger.warn('Validation failed: cpfCount must be greater than zero', { cpfCount });
      return PriceCalculatorService.errorResult('Número de CPF deve ser maior que zero');
    }
    const quantities = InterpolationUtil.extractSortedQuantities(priceTable);
    if (quantities.length === 0) {
      this.logger.warn('Validation failed: price table is empty');
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
      this.logger.warn('Failed to extract price table data: minQty or maxQty undefined');
      return PriceCalculatorService.errorResult('Erro ao processar tabela de preços');
    }

    // Calculate actual min/max from values, not positions
    const allPrices = quantities.map(qty => priceTable[qty]).filter((p): p is number => p !== undefined);

    if (allPrices.length === 0) {
      this.logger.warn('Failed to extract price table data: no valid prices found');
      return PriceCalculatorService.errorResult('Preços não encontrados na tabela');
    }

    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);

    const priceAtMinQty = priceTable[minQty];
    const priceAtMaxQty = priceTable[maxQty];

    if (priceAtMinQty === undefined || priceAtMaxQty === undefined) {
      this.logger.warn('Failed to extract price table data: priceAtMinQty or priceAtMaxQty undefined');
      return PriceCalculatorService.errorResult('Preços nas quantidades limite não encontrados');
    }

    const allPricesSame = allPrices.every(price => price === allPrices[0]);

    this.logger.log('Extracted price table data', { minQty, maxQty, minPrice, maxPrice, priceAtMinQty, priceAtMaxQty, allPricesSame });

    return {
      quantities,
      minQty,
      maxQty,
      maxPrice,
      minPrice,
      priceAtMinQty,
      priceAtMaxQty,
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
    priceAtMinQty: number,
    priceTable: PriceTableV2,
    quantities: number[],
    allPricesSame: boolean,
  ): number {
    const slope = this.getExtrapolationSlope(priceTable, quantities, allPricesSame);
    return priceAtMinQty + slope * (quantityPerCpf - minQty);
  }

  /**
   * Aplica limites de preço (minPrice, maxPrice e customMaxPrice se fornecido)
   */
  private applyPriceLimits(
    price: number,
    maxPrice: number,
    minPrice: number,
    customMaxPrice?: number,
  ): number {
    // Primeiro aplica o limite mínimo da tabela
    let finalPrice = Math.max(price, minPrice);

    // Depois aplica o limite máximo (o menor entre maxPrice da tabela e customMaxPrice se fornecido)
    const effectiveMaxPrice = customMaxPrice !== undefined
      ? customMaxPrice
      : maxPrice;

    finalPrice = Math.min(finalPrice, effectiveMaxPrice);

    if (finalPrice !== price) {
      this.logger.log('Price limits applied', { originalPrice: price, finalPrice, minPrice, maxPrice, customMaxPrice });
    }

    return finalPrice;
  }

  /**
   * Calcula preço quando quantidade está exatamente no mínimo
   */
  private calculatePriceAtMinimum(
    priceAtMinQty: number,
    minPrice: number,
    maxPrice: number,
    customMaxPrice?: number,
  ): PriceCalculationResult {
    const finalPrice = this.applyPriceLimits(priceAtMinQty, maxPrice, minPrice, customMaxPrice);
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
    const { minQty, maxPrice, minPrice, priceAtMinQty, quantities, allPricesSame } = tableData;

    if (allPricesSame && quantities.length === 2 && customMaxPrice === undefined) {
      this.logger.log('Using priceAtMinQty for same-price table with 2 quantities', { priceAtMinQty });
      return PriceCalculatorService.successResult(priceAtMinQty);
    }

    const slope = this.getExtrapolationSlope(priceTable, quantities, allPricesSame);
    const extrapolatedPrice = this.extrapolatePrice(
      quantityPerCpf,
      minQty,
      priceAtMinQty,
      priceTable,
      quantities,
      allPricesSame,
    );

    this.logger.log('Extrapolation result', { quantityPerCpf, minQty, slope, extrapolatedPrice });

    // Aplica limites incluindo customMaxPrice (extrapolação funciona para qualquer cpfCount)
    const finalPrice = this.applyPriceLimits(extrapolatedPrice, maxPrice, minPrice, customMaxPrice);
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
    maxPrice: number,
    customMaxPrice?: number,
  ): PriceCalculationResult {
    const points = InterpolationUtil.findInterpolationPoints(quantityPerCpf, quantities);
    if (!points) {
      this.logger.warn('Could not find interpolation points', { quantityPerCpf });
      return PriceCalculatorService.errorResult(
        'Não foi possível encontrar pontos para interpolação',
      );
    }

    const lowerPrice = priceTable[points.lower];
    const upperPrice = priceTable[points.upper];

    if (lowerPrice === undefined || upperPrice === undefined) {
      this.logger.warn('Interpolation prices not found', { lowerQty: points.lower, upperQty: points.upper });
      return PriceCalculatorService.errorResult('Preços para interpolação não encontrados');
    }

    if (lowerPrice === upperPrice) {
      this.logger.log('Interpolation points have same price', { price: lowerPrice });
      const finalPrice = this.applyPriceLimits(lowerPrice, maxPrice, minPrice, customMaxPrice);
      return PriceCalculatorService.successResult(finalPrice);
    }

    const interpolatedPrice = InterpolationUtil.linearInterpolation(
      quantityPerCpf,
      points.lower,
      lowerPrice,
      points.upper,
      upperPrice,
    );

    this.logger.log('Interpolation result', {
      quantityPerCpf,
      lowerQty: points.lower,
      lowerPrice,
      upperQty: points.upper,
      upperPrice,
      interpolatedPrice,
    });

    const finalPrice = this.applyPriceLimits(interpolatedPrice, maxPrice, minPrice, customMaxPrice);
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
    this.logger.log('Calculating price', { quantity, cpfCount, options });

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
    const { minQty, maxQty, minPrice, maxPrice, priceAtMinQty, priceAtMaxQty } = tableData;

    this.logger.log('Calculated quantityPerCpf', { quantityPerCpf, minQty, maxQty });

    let result: PriceCalculationResult;

    if (quantityPerCpf === minQty) {
      this.logger.log('Quantity at minimum, using priceAtMinQty', { priceAtMinQty });
      result = this.calculatePriceAtMinimum(priceAtMinQty, minPrice, maxPrice, options?.customMaxPrice);
    } else if (quantityPerCpf < minQty) {
      this.logger.log('Quantity below minimum, using extrapolation', { quantityPerCpf, minQty });
      result = this.calculatePriceBelowMinimum(
        quantityPerCpf,
        cpfCount,
        tableData,
        priceTable,
        options?.customMaxPrice,
      );
    } else if (quantityPerCpf >= maxQty) {
      this.logger.log('Quantity above maximum, using priceAtMaxQty', { quantityPerCpf, maxQty, priceAtMaxQty });
      result = this.calculatePriceAboveMaximum(priceAtMaxQty);
    } else {
      this.logger.log('Quantity in range, using interpolation', { quantityPerCpf, minQty, maxQty });
      result = this.calculatePriceInRange(
        quantityPerCpf,
        tableData.quantities,
        priceTable,
        minPrice,
        maxPrice,
        options?.customMaxPrice,
      );
    }

    this.logger.log('Price calculation complete', { quantity, cpfCount, result });
    return result;
  }
}

