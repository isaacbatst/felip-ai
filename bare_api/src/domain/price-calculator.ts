import type { PriceTableV2 } from "../types/price.js";
import type { PriceCalculationResult } from "../types/purchase.js";
import {
	extractSortedQuantities,
	findInterpolationPoints,
	linearInterpolation,
} from "../utils/interpolation.js";

/**
 * Opções para cálculo de preço
 */
export interface CalculatePriceOptions {
	/**
	 * Preço máximo customizado. Quando fornecido, o preço calculado não pode exceder este valor.
	 * Para casos com mais de 1 CPF, respeita tanto o máximo padrão quanto o customizado.
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
 * Slope padrão usado quando não há dados suficientes para calcular
 */
const DEFAULT_SLOPE = -1 / 30;

/**
 * Arredonda um número para o quarto mais próximo (0.00, 0.25, 0.50, 0.75)
 */
const roundToQuarter = (value: number): number => Math.round(value * 4) / 4;

/**
 * Cria um resultado de sucesso com preço arredondado
 */
const successResult = (price: number): PriceCalculationResult => ({
	success: true,
	price: roundToQuarter(price),
});

/**
 * Cria um resultado de erro
 */
const errorResult = (reason: string): PriceCalculationResult => ({
	success: false,
	reason,
});

/**
 * Valida os parâmetros de entrada
 */
const validateInputs = (
	quantity: number,
	cpfCount: number,
	priceTable: PriceTableV2,
): PriceCalculationResult | null => {
	if (quantity <= 0) {
		return errorResult("Quantidade deve ser maior que zero");
	}
	if (cpfCount <= 0) {
		return errorResult("Número de CPF deve ser maior que zero");
	}
	const quantities = extractSortedQuantities(priceTable);
	if (quantities.length === 0) {
		return errorResult("Tabela de preços vazia");
	}
	return null;
};

/**
 * Extrai e valida dados da tabela de preços
 */
const extractPriceTableData = (
	priceTable: PriceTableV2,
): PriceTableData | PriceCalculationResult => {
	const quantities = extractSortedQuantities(priceTable);
	const minQty = quantities[0];
	const maxQty = quantities[quantities.length - 1];

	if (minQty === undefined || maxQty === undefined) {
		return errorResult("Erro ao processar tabela de preços");
	}

	const maxPrice = priceTable[minQty];
	const minPrice = priceTable[maxQty];

	if (minPrice === undefined || maxPrice === undefined) {
		return errorResult("Preços mínimo ou máximo não encontrados");
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
};

/**
 * Calcula o slope (inclinação) entre os dois primeiros pontos da tabela
 */
const calculateSlope = (
	priceTable: PriceTableV2,
	quantities: number[],
): number | null => {
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
};

/**
 * Calcula o slope a ser usado na extrapolação
 */
const getExtrapolationSlope = (
	priceTable: PriceTableV2,
	quantities: number[],
	allPricesSame: boolean,
): number => {
	if (allPricesSame && quantities.length >= 3) {
		return DEFAULT_SLOPE;
	}
	return calculateSlope(priceTable, quantities) ?? DEFAULT_SLOPE;
};

/**
 * Calcula o preço usando extrapolação linear para quantidades abaixo do mínimo
 */
const extrapolatePrice = (
	quantityPerCpf: number,
	minQty: number,
	maxPrice: number,
	priceTable: PriceTableV2,
	quantities: number[],
	allPricesSame: boolean,
): number => {
	const slope = getExtrapolationSlope(priceTable, quantities, allPricesSame);
	return maxPrice + slope * (quantityPerCpf - minQty);
};

/**
 * Aplica limites de preço para múltiplos CPFs sem customMaxPrice
 */
const applyPriceLimits = (
	price: number,
	maxPrice: number,
	minPrice: number,
): number => {
	return Math.max(Math.min(price, maxPrice), minPrice);
};

/**
 * Calcula preço quando quantidade está exatamente no mínimo
 */
const calculatePriceAtMinimum = (
	maxPrice: number,
	customMaxPrice?: number,
): PriceCalculationResult => {
	const finalPrice =
		customMaxPrice !== undefined ? Math.min(maxPrice, customMaxPrice) : maxPrice;
	return successResult(finalPrice);
};

/**
 * Calcula preço quando quantidade está abaixo do mínimo (extrapolação)
 */
const calculatePriceBelowMinimum = (
	quantityPerCpf: number,
	cpfCount: number,
	tableData: PriceTableData,
	priceTable: PriceTableV2,
	customMaxPrice?: number,
): PriceCalculationResult => {
	const { minQty, maxPrice, minPrice, quantities, allPricesSame } = tableData;

	// Caso especial: preços iguais com apenas 2 pontos e sem customMaxPrice
	if (allPricesSame && quantities.length === 2 && customMaxPrice === undefined) {
		return successResult(maxPrice);
	}

	const extrapolatedPrice = extrapolatePrice(
		quantityPerCpf,
		minQty,
		maxPrice,
		priceTable,
		quantities,
		allPricesSame,
	);

	// Com customMaxPrice, aplica limite customizado
	if (customMaxPrice !== undefined) {
		return successResult(Math.min(extrapolatedPrice, customMaxPrice));
	}

	// Para 1 CPF, retorna teto fixo (não extrapola)
	if (cpfCount === 1) {
		return successResult(maxPrice);
	}

	// Para múltiplos CPFs, aplica limites padrão
	const finalPrice = applyPriceLimits(extrapolatedPrice, maxPrice, minPrice);
	return successResult(finalPrice);
};

/**
 * Calcula preço quando quantidade está acima do máximo
 */
const calculatePriceAboveMaximum = (
	minPrice: number,
): PriceCalculationResult => {
	return successResult(minPrice);
};

/**
 * Calcula preço quando quantidade está dentro do intervalo (interpolação)
 */
const calculatePriceInRange = (
	quantityPerCpf: number,
	quantities: number[],
	priceTable: PriceTableV2,
	minPrice: number,
): PriceCalculationResult => {
	const points = findInterpolationPoints(quantityPerCpf, quantities);
	if (!points) {
		return errorResult("Não foi possível encontrar pontos para interpolação");
	}

	const lowerPrice = priceTable[points.lower];
	const upperPrice = priceTable[points.upper];

	if (lowerPrice === undefined || upperPrice === undefined) {
		return errorResult("Preços para interpolação não encontrados");
	}

	// Se os preços são iguais, retorna diretamente
	if (lowerPrice === upperPrice) {
		return successResult(lowerPrice);
	}

	// Interpolação linear normal
	const interpolatedPrice = linearInterpolation(
		quantityPerCpf,
		points.lower,
		lowerPrice,
		points.upper,
		upperPrice,
	);

	// Garante que nunca fique abaixo do piso mínimo
	const finalPrice = Math.max(interpolatedPrice, minPrice);
	return successResult(finalPrice);
};

/**
 * Calcula o preço usando interpolação linear baseado na tabela de preços v2
 * Todos os registros são para 1 CPF. Se o usuário solicita 2+ CPFs, calcula o preço por CPF
 * usando interpolação linear inversa (preço é inversamente proporcional à quantidade)
 * Função pura e testável - recebe todas as dependências como parâmetros
 */
export const calculatePrice = (
	quantity: number,
	cpfCount: number,
	priceTable: PriceTableV2,
	options?: CalculatePriceOptions,
): PriceCalculationResult => {
	// Validações básicas
	const validationError = validateInputs(quantity, cpfCount, priceTable);
	if (validationError) {
		return validationError;
	}

	// Extrai dados da tabela
	const tableDataOrError = extractPriceTableData(priceTable);
	if (!("quantities" in tableDataOrError)) {
		return tableDataOrError;
	}
	const tableData = tableDataOrError;

	const quantityPerCpf = quantity / cpfCount;
	const { minQty, maxQty, minPrice } = tableData;

	// Caso 1: Quantidade exatamente no mínimo
	if (quantityPerCpf === minQty) {
		return calculatePriceAtMinimum(tableData.maxPrice, options?.customMaxPrice);
	}

	// Caso 2: Quantidade abaixo do mínimo (extrapolação)
	if (quantityPerCpf < minQty) {
		return calculatePriceBelowMinimum(
			quantityPerCpf,
			cpfCount,
			tableData,
			priceTable,
			options?.customMaxPrice,
		);
	}

	// Caso 3: Quantidade acima do máximo (usa piso)
	if (quantityPerCpf >= maxQty) {
		return calculatePriceAboveMaximum(minPrice);
	}

	// Caso 4: Quantidade dentro do intervalo (interpolação)
	return calculatePriceInRange(
		quantityPerCpf,
		tableData.quantities,
		priceTable,
		minPrice,
	);
};


