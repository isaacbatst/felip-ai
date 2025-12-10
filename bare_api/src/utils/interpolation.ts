import type { PriceTable } from "../types/price.js";

/**
 * Encontra os dois pontos mais próximos para interpolação
 * Função pura e previsível
 */
export const findInterpolationPoints = (
	quantity: number,
	quantities: number[],
): { lower: number; upper: number } | null => {
	console.log("[DEBUG] interpolation: Finding interpolation points", {
		quantity,
		quantities,
	});

	if (quantities.length < 2) {
		console.log("[DEBUG] interpolation: Not enough quantities for interpolation");
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
			console.log("[DEBUG] interpolation: Found interpolation points", {
				lower: currentQty,
				upper: nextQty,
			});
			return { lower: currentQty, upper: nextQty };
		}
	}

	console.log("[DEBUG] interpolation: No interpolation points found");
	return null;
};

/**
 * Calcula interpolação linear entre dois pontos
 * Função pura matemática
 */
export const linearInterpolation = (
	x: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number => {
	console.log("[DEBUG] interpolation: Performing linear interpolation", {
		x,
		x1,
		y1,
		x2,
		y2,
	});
	const ratio = (x - x1) / (x2 - x1);
	const result = y1 + (y2 - y1) * ratio;
	console.log("[DEBUG] interpolation: Interpolation result", {
		ratio,
		result,
	});
	return result;
};

/**
 * Extrai e ordena as quantidades de uma tabela de preços
 * Função pura de transformação
 */
export const extractSortedQuantities = (table: PriceTable): number[] => {
	console.log("[DEBUG] interpolation: Extracting sorted quantities from table", {
		tableKeys: Object.keys(table),
	});
	const quantities = Object.keys(table)
		.map(Number)
		.sort((a, b) => a - b)
		.filter((qty) => !Number.isNaN(qty));
	console.log("[DEBUG] interpolation: Extracted and sorted quantities:", quantities);
	return quantities;
};

