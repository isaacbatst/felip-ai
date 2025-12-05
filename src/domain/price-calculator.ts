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

	// Se a quantidade é menor que o mínimo, extrapola linearmente para cima
	if (quantity < minQty) {
		console.log("[DEBUG] price-calculator: Quantity < min, extrapolating linearly upward");
		
		if (quantities.length < 2) {
			console.log("[DEBUG] price-calculator: Not enough points for extrapolation");
			const minPrice = table[minQty];
			if (minPrice === undefined) {
				return {
					success: false,
					reason: "Preço mínimo não encontrado",
				};
			}
			return {
				success: true,
				price: roundToTwoDecimals(minPrice),
			};
		}

		// Usa os dois primeiros pontos para calcular a taxa de variação
		// Se os dois primeiros tiverem o mesmo preço, procura o próximo ponto diferente
		const firstQty = quantities[0];

		if (firstQty === undefined) {
			console.log("[DEBUG] price-calculator: Error getting first point for extrapolation");
			return {
				success: false,
				reason: "Erro ao calcular extrapolação",
			};
		}

		const firstPrice = table[firstQty];

		if (firstPrice === undefined) {
			console.log("[DEBUG] price-calculator: Error getting first price for extrapolation");
			return {
				success: false,
				reason: "Erro ao calcular extrapolação",
			};
		}

		// Procura o próximo ponto com preço diferente
		let secondQty: number | undefined;
		let secondPrice: number | undefined;
		
		for (let i = 1; i < quantities.length; i++) {
			const qty = quantities[i];
			const price = qty !== undefined ? table[qty] : undefined;
			
			if (qty !== undefined && price !== undefined && price !== firstPrice) {
				secondQty = qty;
				secondPrice = price;
				break;
			}
		}

		// Se todos os pontos têm o mesmo preço, retorna o preço mínimo
		if (secondQty === undefined || secondPrice === undefined) {
			console.log("[DEBUG] price-calculator: All points have the same price, returning minimum price");
			return {
				success: true,
				price: roundToTwoDecimals(firstPrice),
			};
		}

		// Calcula a taxa de variação (slope) entre o primeiro ponto e o próximo ponto diferente
		// e extrapola linearmente para quantidades menores
		const price = linearInterpolation(
			quantity,
			firstQty,
			firstPrice,
			secondQty,
			secondPrice,
		);

		const roundedPrice = roundToQuarter(price);
		console.log("[DEBUG] price-calculator: Extrapolated price (upward):", roundedPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Se a quantidade é igual ao mínimo, retorna o preço mínimo
	if (quantity === minQty) {
		console.log("[DEBUG] price-calculator: Quantity == min, using minimum price");
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

	// Se a quantidade é maior que o máximo, extrapola linearmente para baixo
	if (quantity > maxQty) {
		console.log("[DEBUG] price-calculator: Quantity > max, extrapolating linearly downward");
		
		if (quantities.length < 2) {
			console.log("[DEBUG] price-calculator: Not enough points for extrapolation");
			const maxPrice = table[maxQty];
			if (maxPrice === undefined) {
				return {
					success: false,
					reason: "Preço máximo não encontrado",
				};
			}
			return {
				success: true,
				price: roundToTwoDecimals(maxPrice),
			};
		}

		// Usa os dois últimos pontos para calcular a taxa de variação
		// Se os dois últimos tiverem o mesmo preço, procura o ponto anterior com preço diferente
		const lastQty = quantities[quantities.length - 1];

		if (lastQty === undefined) {
			console.log("[DEBUG] price-calculator: Error getting last point for extrapolation");
			return {
				success: false,
				reason: "Erro ao calcular extrapolação",
			};
		}

		const lastPrice = table[lastQty];

		if (lastPrice === undefined) {
			console.log("[DEBUG] price-calculator: Error getting last price for extrapolation");
			return {
				success: false,
				reason: "Erro ao calcular extrapolação",
			};
		}

		// Procura o ponto anterior com preço diferente
		let secondLastQty: number | undefined;
		let secondLastPrice: number | undefined;
		
		for (let i = quantities.length - 2; i >= 0; i--) {
			const qty = quantities[i];
			const price = qty !== undefined ? table[qty] : undefined;
			
			if (qty !== undefined && price !== undefined && price !== lastPrice) {
				secondLastQty = qty;
				secondLastPrice = price;
				break;
			}
		}

		// Se todos os pontos têm o mesmo preço, retorna o preço máximo
		if (secondLastQty === undefined || secondLastPrice === undefined) {
			console.log("[DEBUG] price-calculator: All points have the same price, returning maximum price");
			return {
				success: true,
				price: roundToTwoDecimals(lastPrice),
			};
		}

		// Calcula a taxa de variação (slope) entre o último ponto e o ponto anterior com preço diferente
		// e extrapola linearmente para quantidades maiores
		const price = linearInterpolation(
			quantity,
			secondLastQty,
			secondLastPrice,
			lastQty,
			lastPrice,
		);

		const roundedPrice = roundToQuarter(price);
		console.log("[DEBUG] price-calculator: Extrapolated price (downward):", roundedPrice);
		return {
			success: true,
			price: roundedPrice,
		};
	}

	// Se a quantidade é igual ao máximo, retorna o preço máximo
	if (quantity === maxQty) {
		console.log("[DEBUG] price-calculator: Quantity == max, using maximum price");
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

