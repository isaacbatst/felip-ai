import { describe, expect, it } from "vitest";
import type { PriceTableByCpf } from "../types/price.js";
import { calculatePrice } from "./price-calculator.js";

describe("calculatePrice", () => {
	// Tabela de preços de teste baseada na configuração real
	const testPriceTable: PriceTableByCpf = {
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

	describe("quantidade abaixo do mínimo", () => {
		it("deve escalar linearmente para cima quando quantidade é menor que o mínimo", () => {
			// Taxa de variação entre (30, 17) e (60, 16.5): slope = (16.5 - 17) / (60 - 30) = -0.5 / 30 = -0.01667
			// Para quantidade 20: preço = 17 + (-0.01667) * (20 - 30) = 17 + 0.1667 = 17.1667
			// Arredondado para quarto: 17.1667 -> 17.25
			const result = calculatePrice(20, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17.25); // escalado linearmente para cima
			}
		});

		it('deve escalar linearmente para cima quando quantidade é menor que o mínimo e há mais de 1 CPF', () => {
			// Para CPF 3: mínimo é 60 (preço 17), segundo ponto é 90 (preço 17 - igual)
			// Como os dois primeiros são iguais, usa o próximo diferente: 120 (preço 16.75)
			// Taxa de variação: slope = (16.75 - 17) / (120 - 60) = -0.25 / 60 = -0.004167
			// Para quantidade 42: preço = 17 + (-0.004167) * (42 - 60) = 17 + 0.075 = 17.075
			// Arredondado para quarto: 17.075 -> 17.0
			const result = calculatePrice(30, 3, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17.25); // escalado linearmente usando próximo ponto diferente
			}
		});

		it("deve retornar o preço mínimo quando quantidade é igual ao mínimo", () => {
			const result = calculatePrice(30, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17); // preço mínimo
			}
		});

		it("deve escalar linearmente para cima quando quantidade é muito menor que o mínimo", () => {
			// Taxa de variação: slope = -0.01667
			// Para quantidade 1: preço = 17 + (-0.01667) * (1 - 30) = 17 + 0.4833 = 17.4833
			// Arredondado para quarto: 17.4833 -> 17.5
			const result = calculatePrice(1, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17.5); // escalado linearmente para cima
			}
		});

		it("deve escalar linearmente para cima quando quantidade está entre 0 e o mínimo", () => {
			// Para quantidade 15: preço = 17 + (-0.01667) * (15 - 30) = 17 + 0.25 = 17.25
			// Arredondado para quarto: 17.25
			const result = calculatePrice(15, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17.25);
			}
		});
	});

	describe("quantidade dentro do intervalo (entre mínimo e máximo)", () => {
		it("deve calcular preço por interpolação quando quantidade está entre dois pontos", () => {
			// 75 está entre 60 (16.5) e 90 (16.25)
			// Interpolação linear: y = y1 + (y2 - y1) * ((x - x1) / (x2 - x1))
			// y = 16.5 + (16.25 - 16.5) * ((75 - 60) / (90 - 60))
			// y = 16.5 + (-0.25) * (15 / 30)
			// y = 16.5 + (-0.25) * 0.5
			// y = 16.5 - 0.125
			// y = 16.375
			// Arredondado para o quarto mais próximo: 16.375 -> 16.5 (mais próximo de 16.5)
			const result = calculatePrice(75, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				// O preço deve ser interpolado e arredondado para o quarto mais próximo
				// 16.375 arredonda para 16.5 (quarto mais próximo)
				expect(result.price).toBe(16.5);
			}
		});

		it("deve retornar preço exato quando quantidade corresponde a um ponto da tabela", () => {
			const result = calculatePrice(60, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16.5);
			}
		});

		it("deve calcular preço por interpolação quando quantidade está próxima do mínimo", () => {
			// 45 está entre 30 (17) e 60 (16.5)
			const result = calculatePrice(45, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				// Deve estar entre 17 e 16.5
				expect(result.price).toBeGreaterThanOrEqual(16.5);
				expect(result.price).toBeLessThanOrEqual(17);
			}
		});

		it("deve calcular preço por interpolação quando quantidade está próxima do máximo", () => {
			// 105 está entre 90 (16.25) e 120 (16)
			const result = calculatePrice(105, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				// Deve estar entre 16 e 16.25
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBeLessThanOrEqual(16.25);
			}
		});
	});

	describe("quantidade acima do máximo", () => {
		it("deve escalar linearmente para baixo quando quantidade é maior que o máximo", () => {
			// Taxa de variação entre (90, 16.25) e (120, 16): slope = (16 - 16.25) / (120 - 90) = -0.25 / 30 = -0.00833
			// Para quantidade 150: preço = 16 + (-0.00833) * (150 - 120) = 16 - 0.25 = 15.75
			// Arredondado para quarto: 15.75
			const result = calculatePrice(150, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(15.75); // escalado linearmente para baixo
			}
		});

		it("deve retornar o preço máximo quando quantidade é igual ao máximo", () => {
			const result = calculatePrice(120, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16); // preço máximo
			}
		});

		it("deve escalar linearmente para baixo quando quantidade é muito maior que o máximo", () => {
			// Taxa de variação: slope = -0.00833
			// Para quantidade 1000: preço = 16 + (-0.00833) * (1000 - 120) = 16 - 7.33 = 8.67
			// Arredondado para quarto: 8.67 -> 8.75
			const result = calculatePrice(1000, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(8.75); // escalado linearmente para baixo
			}
		});

		it("deve escalar linearmente para baixo quando quantidade está acima do máximo", () => {
			// Para quantidade 200: preço = 16 + (-0.00833) * (200 - 120) = 16 - 0.6664 = 15.3336
			// Arredondado para quarto: 15.3336 -> 15.25
			const result = calculatePrice(200, 1, testPriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(15.25);
			}
		});
	});

	describe("casos de erro", () => {
		it("deve retornar erro quando número de CPF não existe na tabela", () => {
			const result = calculatePrice(50, 99, testPriceTable);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toContain("CPF não suportado");
			}
		});

		it("deve retornar erro quando tabela de preços está vazia", () => {
			const emptyTable: PriceTableByCpf = {
				1: {},
			};
			const result = calculatePrice(50, 1, emptyTable);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toContain("vazia");
			}
		});
	});
});

