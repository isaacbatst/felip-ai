import type { PriceTableByCpf } from "../types/price.js";
import type { PriceCalculationResult } from "../types/purchase.js";
import {
	extractSortedQuantities,
	findInterpolationPoints,
	linearInterpolation,
} from "../utils/interpolation.js";

/**
 * Calcula o preço usando interpolação linear baseado na tabela de preços
 * Função pura e testável - recebe todas as dependências como parâmetros
 */
export const calculatePrice = (
	quantity: number,
	cpfCount: number,
	priceTable: PriceTableByCpf,
): PriceCalculationResult => {
	console.log("[DEBUG] price-calculator: Starting price calculation", {
		quantity,
		cpfCount,
		availableCpfCounts: Object.keys(priceTable),
	});

	const table = priceTable[cpfCount];

	if (!table) {
		console.log("[DEBUG] price-calculator: CPF count not found in price table:", cpfCount);
		return {
			success: false,
			reason: `Número de CPF não suportado: ${cpfCount}`,
		};
	}

	console.log("[DEBUG] price-calculator: Found price table for CPF count:", {
		cpfCount,
		tableEntries: Object.keys(table).length,
	});

	const quantities = extractSortedQuantities(table);
	console.log("[DEBUG] price-calculator: Extracted sorted quantities:", quantities);

	if (quantities.length === 0) {
		console.log("[DEBUG] price-calculator: Price table is empty");
		return {
			success: false,
			reason: "Tabela de preços vazia",
		};
	}

	const minQty = quantities[0];
	const maxQty = quantities[quantities.length - 1];

	if (minQty === undefined || maxQty === undefined) {
		console.log("[DEBUG] price-calculator: Error extracting min/max quantities");
		return {
			success: false,
			reason: "Erro ao processar tabela de preços",
		};
	}

	console.log("[DEBUG] price-calculator: Quantity range:", {
		minQty,
		maxQty,
		requestedQuantity: quantity,
	});

	// Se a quantidade é menor ou igual ao mínimo, retorna o preço mínimo fixo
	if (quantity <= minQty) {
		console.log("[DEBUG] price-calculator: Quantity <= min, using minimum price");
		const minPrice = table[minQty];
		if (minPrice === undefined) {
			console.log("[DEBUG] price-calculator: Minimum price not found in table");
			return {
				success: false,
				reason: "Preço mínimo não encontrado",
			};
		}
		const roundedPrice = roundToTwoDecimals(minPrice);
		console.log("[DEBUG] price-calculator: Returning minimum price:", roundedPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Se a quantidade é maior ou igual ao máximo, retorna o preço máximo fixo
	if (quantity >= maxQty) {
		console.log("[DEBUG] price-calculator: Quantity >= max, using maximum price");
		const maxPrice = table[maxQty];
		if (maxPrice === undefined) {
			console.log("[DEBUG] price-calculator: Maximum price not found in table");
			return {
				success: false,
				reason: "Preço máximo não encontrado",
			};
		}
		const roundedPrice = roundToTwoDecimals(maxPrice);
		console.log("[DEBUG] price-calculator: Returning maximum price:", roundedPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	console.log("[DEBUG] price-calculator: Quantity is within range, finding interpolation points...");
	const points = findInterpolationPoints(quantity, quantities);

	if (!points) {
		console.log("[DEBUG] price-calculator: Could not find interpolation points");
		return {
			success: false,
			reason: "Não foi possível encontrar pontos para interpolação",
		};
	}

	console.log("[DEBUG] price-calculator: Interpolation points found:", points);

	const lowerPrice = table[points.lower];
	const upperPrice = table[points.upper];

	if (lowerPrice === undefined || upperPrice === undefined) {
		console.log("[DEBUG] price-calculator: Prices not found for interpolation points", {
			lower: points.lower,
			upper: points.upper,
			lowerPrice,
			upperPrice,
		});
		return {
			success: false,
			reason: "Preços para interpolação não encontrados",
		};
	}

	console.log("[DEBUG] price-calculator: Performing linear interpolation", {
		quantity,
		lowerQty: points.lower,
		lowerPrice,
		upperQty: points.upper,
		upperPrice,
	});

	const price = linearInterpolation(
		quantity,
		points.lower,
		lowerPrice,
		points.upper,
		upperPrice,
	);

	console.log("[DEBUG] price-calculator: Price before quarter rounding:", price);
	const roundedPrice = roundToQuarter(price);
	console.log("[DEBUG] price-calculator: Interpolation complete, calculated price (rounded to quarter):", roundedPrice);

	return {
		success: true,
		price: roundedPrice,
	};
};

/**
 * Arredonda um número para 2 casas decimais
 * Função pura utilitária
 */
const roundToTwoDecimals = (value: number): number => {
	return Math.round(value * 100) / 100;
};

/**
 * Arredonda um número para o quarto mais próximo (0.00, 0.25, 0.50, 0.75)
 * Usado para valores interpolados
 */
const roundToQuarter = (value: number): number => {
	return Math.round(value * 4) / 4;
};

