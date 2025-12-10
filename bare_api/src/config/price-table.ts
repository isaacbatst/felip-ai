import type { PriceTableByCpf } from "../types/price.js";

/**
 * Tabela de preços por número de CPF
 * Configuração centralizada que pode ser facilmente modificada
 */
export const PRICE_TABLE: PriceTableByCpf = {
	1: {
		30: 17, // 1 CPF, 30k milhas por R$ 17
		60: 16.5,
		90: 16.25,
		120: 16,
	},
	2: {
		30: 17.5,
		60: 17,
		90: 16.75,
		120: 16.25,
	},
	3: {
		60: 17,
		90: 17,
		120: 16.75,
		150: 16.5,
	},
};

