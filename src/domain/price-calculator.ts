import type { PriceTableByCpf, PriceTableV2 } from "../types/price.js";
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

/**
 * Calcula o preço usando interpolação linear baseado na tabela de preços v2
 * Todos os registros são para 1 CPF. Se o usuário solicita 2+ CPFs, calcula o preço por CPF
 * usando interpolação linear inversa (preço é inversamente proporcional à quantidade)
 * Função pura e testável - recebe todas as dependências como parâmetros
 */
export const calculatePriceV2 = (
	quantity: number,
	cpfCount: number,
	priceTable: PriceTableV2,
): PriceCalculationResult => {
	// Validações básicas
	if (quantity <= 0) {
		return {
			success: false,
			reason: "Quantidade deve ser maior que zero",
		};
	}

	if (cpfCount <= 0) {
		return {
			success: false,
			reason: "Número de CPF deve ser maior que zero",
		};
	}

	const quantities = extractSortedQuantities(priceTable);

	if (quantities.length === 0) {
		return {
			success: false,
			reason: "Tabela de preços vazia",
		};
	}

	// Calcula quantidade por CPF
	const quantityPerCpf = quantity / cpfCount;

	const minQty = quantities[0];
	const maxQty = quantities[quantities.length - 1];

	if (minQty === undefined || maxQty === undefined) {
		return {
			success: false,
			reason: "Erro ao processar tabela de preços",
		};
	}

	const minPrice = priceTable[minQty];
	const maxPrice = priceTable[maxQty];

	if (minPrice === undefined || maxPrice === undefined) {
		return {
			success: false,
			reason: "Preços mínimo ou máximo não encontrados",
		};
	}

	// Verifica se todos os preços são iguais para usar variância padrão
	const allPricesSame = quantities.every((qty) => priceTable[qty] === minPrice);

	// Se quantidade por CPF está abaixo do mínimo
	if (quantityPerCpf < minQty) {
		// Se for 1 CPF, retorna preço mínimo fixo (não extrapola)
		if (cpfCount === 1) {
			const roundedPrice = roundToTwoDecimals(minPrice);
			return {
				success: true,
				price: roundedPrice,
			};
		}

		// Para múltiplos CPFs, extrapola para trás usando interpolação inversa
		let pricePerCpf: number;

		if (allPricesSame) {
			// Se todos os preços são iguais:
			// - Com 3+ pontos: usa variância padrão para extrapolação
			// - Com apenas 2 pontos: retorna o preço diretamente (não há dados suficientes para variância)
			if (quantities.length >= 3) {
				// Variância padrão: assume slope de -1/30 (similar ao exemplo 30k->17, 60k->16)
				const defaultSlope = -1 / 30;
				pricePerCpf = minPrice + defaultSlope * (quantityPerCpf - minQty);
			} else {
				// Apenas 2 pontos iguais, retorna o preço diretamente
				const roundedPrice = roundToTwoDecimals(minPrice);
				return {
					success: true,
					price: roundedPrice,
				};
			}
		} else {
			// Calcula slope usando os dois primeiros pontos
			const secondQty = quantities[1];
			if (secondQty === undefined) {
				// Apenas um ponto, usa variância padrão
				const defaultSlope = -1 / 30;
				pricePerCpf = minPrice + defaultSlope * (quantityPerCpf - minQty);
			} else {
				const secondPrice = priceTable[secondQty];
				if (secondPrice === undefined) {
					const defaultSlope = -1 / 30;
					pricePerCpf = minPrice + defaultSlope * (quantityPerCpf - minQty);
				} else {
					// Calcula slope entre primeiro e segundo ponto
					const slope = (secondPrice - minPrice) / (secondQty - minQty);
					pricePerCpf = minPrice + slope * (quantityPerCpf - minQty);
				}
			}
		}

		// Garante que o preço nunca fique abaixo do menor valor da tabela (piso mínimo)
		const finalPrice = Math.max(pricePerCpf, maxPrice);
		const roundedPrice = roundToTwoDecimals(finalPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Se quantidade por CPF está acima do máximo, usa preço máximo
	if (quantityPerCpf >= maxQty) {
		const roundedPrice = roundToTwoDecimals(maxPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Quantidade por CPF está dentro do intervalo, interpola
	const points = findInterpolationPoints(quantityPerCpf, quantities);

	if (!points) {
		return {
			success: false,
			reason: "Não foi possível encontrar pontos para interpolação",
		};
	}

	const lowerPrice = priceTable[points.lower];
	const upperPrice = priceTable[points.upper];

	if (lowerPrice === undefined || upperPrice === undefined) {
		return {
			success: false,
			reason: "Preços para interpolação não encontrados",
		};
	}

	// Se os preços são iguais, retorna o preço diretamente
	if (lowerPrice === upperPrice) {
		const roundedPrice = roundToTwoDecimals(lowerPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Interpolação linear normal
	const pricePerCpf = linearInterpolation(
		quantityPerCpf,
		points.lower,
		lowerPrice,
		points.upper,
		upperPrice,
	);

	// Garante que o preço nunca fique abaixo do menor valor da tabela (piso mínimo)
	const finalPrice = Math.max(pricePerCpf, maxPrice);
	const roundedPrice = roundToTwoDecimals(finalPrice);
	return {
		success: true,
		price: roundedPrice,
	};
};

