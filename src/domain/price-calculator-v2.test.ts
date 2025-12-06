import { describe, expect, it } from "vitest";
import type { PriceTableV2 } from "../types/price.js";
import { calculatePriceV2 } from "./price-calculator.js";

describe("calculatePriceV2", () => {
	// Tabela de preços v2: apenas quantidade e preço, todos para 1 CPF
	const testPriceTableV2: PriceTableV2 = {
		30: 17, // 1 CPF, 30k milhas por R$ 17
		60: 16, // 1 CPF, 60k milhas por R$ 16
	};

	describe("1 CPF - casos básicos", () => {
		it("deve retornar preço exato quando quantidade corresponde a um ponto da tabela", () => {
			const result = calculatePriceV2(30, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17);
			}
		});

		it("deve retornar preço exato para outro ponto da tabela", () => {
			const result = calculatePriceV2(60, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16);
			}
		});

		it("deve calcular preço por interpolação quando quantidade está entre dois pontos", () => {
			// 45 está entre 30 (17) e 60 (16)
			// Interpolação linear: y = y1 + (y2 - y1) * ((x - x1) / (x2 - x1))
			// y = 17 + (16 - 17) * ((45 - 30) / (60 - 30))
			// y = 17 + (-1) * (15 / 30)
			// y = 17 - 0.5
			// y = 16.5
			const result = calculatePriceV2(45, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16.5);
			}
		});

		it("deve retornar preço mínimo quando quantidade é menor que o mínimo", () => {
			const result = calculatePriceV2(20, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17); // preço mínimo fixo
			}
		});

		it("deve retornar preço máximo quando quantidade é maior que o máximo", () => {
			const result = calculatePriceV2(100, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16); // preço máximo fixo
			}
		});
	});

	describe("2 ou mais CPFs - cálculo por CPF com interpolação inversa", () => {
		it("deve calcular preço corretamente para 2 CPFs com 30k total (15k por CPF)", () => {
			// 2 CPF, 30k total = 15k por CPF
			// Como 15k < 30k (mínimo), o preço por CPF deve ser maior que 17
			// Usando interpolação linear inversa: extrapolação para trás
			// Slope = (16 - 17) / (60 - 30) = -1/30 = -0.0333...
			// Para 15k: price = 17 + (-0.0333...) * (15 - 30) = 17 + (-0.0333...) * (-15) = 17 + 0.5 = 17.5
			const result = calculatePriceV2(30, 2, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				// 15k por CPF está abaixo do mínimo (30k), então extrapolamos
				// Usando a inclinação da reta: (16-17)/(60-30) = -1/30
				// Para 15k: 17 + (-1/30) * (15 - 30) = 17 + 0.5 = 17.5
				expect(result.price).toBe(17.5);
			}
		});

		it("deve calcular preço corretamente para 2 CPFs com 60k total (30k por CPF)", () => {
			// 2 CPF, 60k total = 30k por CPF (exatamente no ponto da tabela)
			const result = calculatePriceV2(60, 2, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17); // preço para 30k por CPF
			}
		});

		it("deve calcular preço corretamente para 2 CPFs com 90k total (45k por CPF)", () => {
			// 2 CPF, 90k total = 45k por CPF (entre 30k e 60k)
			// Interpolação: 17 + (16 - 17) * ((45 - 30) / (60 - 30)) = 17 - 0.5 = 16.5
			const result = calculatePriceV2(90, 2, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(16.5);
			}
		});

		it("deve calcular preço corretamente para 3 CPFs com 30k total (10k por CPF)", () => {
			// 3 CPF, 30k total = 10k por CPF
			// 10k < 30k, então extrapolamos para trás
			// Slope = -1/30, para 10k: 17 + (-1/30) * (10 - 30) = 17 + 0.666... = 17.67
			const result = calculatePriceV2(30, 3, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				// 10k por CPF: 17 + (-1/30) * (10 - 30) = 17 + 2/3 = 17.666...
				// Arredondado para 2 casas decimais: 17.67
				expect(result.price).toBeCloseTo(17.67, 2);
			}
		});

		it("deve calcular preço corretamente para 4 CPFs com 60k total (15k por CPF)", () => {
			// 4 CPF, 60k total = 15k por CPF (mesmo caso do primeiro teste)
			const result = calculatePriceV2(60, 4, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBe(17.5);
			}
		});
	});

	describe("casos com valores iguais na tabela", () => {
		it("deve usar variância padrão quando todos os valores são iguais", () => {
			const samePriceTable: PriceTableV2 = {
				30: 17,
				60: 17,
				90: 17,
			};

			// 2 CPF, 30k total = 15k por CPF
			// Como todos os preços são 17, usamos variância padrão
			// Variância padrão razoável: assumimos que preço aumenta 0.5 para cada redução de 15k
			// Então para 15k (15k abaixo de 30k): 17 + 0.5 = 17.5
			const result = calculatePriceV2(30, 2, samePriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				// Com variância padrão, assumimos slope padrão de -0.5/15 = -1/30
				// Para 15k: 17 + (-1/30) * (15 - 30) = 17 + 0.5 = 17.5
				expect(result.price).toBe(17.5);
			}
		});

		it("deve usar variância padrão para interpolação quando valores são iguais", () => {
			const samePriceTable: PriceTableV2 = {
				30: 17,
				60: 17,
			};

			// 2 CPF, 45k total = 22.5k por CPF
			// Como valores são iguais, usamos variância padrão
			const result = calculatePriceV2(45, 2, samePriceTable);

			expect(result.success).toBe(true);
			if (result.success) {
				// Com variância padrão, assumimos slope padrão
				// Para 22.5k (entre 30k e 60k): interpolação com slope padrão
				// Mas como está entre dois pontos iguais, o preço deve ser 17
				expect(result.price).toBe(17);
			}
		});
	});

	describe("garantia de piso mínimo - preço nunca abaixo do menor valor da tabela", () => {
		it("deve garantir que 1 CPF com 120k não fique abaixo do piso de 16", () => {
			// 1 CPF, 120k total = 120k por CPF
			// 120k > 60k (máximo), então deve retornar preço máximo (16)
			const result = calculatePriceV2(120, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16 (piso)
			}
		});

		it("deve garantir que 2 CPFs com 200k não fique abaixo do piso de 16", () => {
			// 2 CPF, 200k total = 100k por CPF
			// 100k > 60k (máximo), então deve retornar preço máximo (16)
			const result = calculatePriceV2(200, 2, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16 (piso)
			}
		});

		it("deve garantir que 3 CPFs com 180k não fique abaixo do piso de 16", () => {
			// 3 CPF, 180k total = 60k por CPF (exatamente no máximo)
			const result = calculatePriceV2(180, 3, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16
			}
		});

		it("deve garantir que 4 CPFs com 240k não fique abaixo do piso de 16", () => {
			// 4 CPF, 240k total = 60k por CPF (exatamente no máximo)
			const result = calculatePriceV2(240, 4, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16
			}
		});

		it("deve garantir que interpolação não resulte em preço abaixo do piso", () => {
			// 2 CPF, 150k total = 75k por CPF
			// 75k > 60k (máximo), então deve retornar preço máximo (16)
			const result = calculatePriceV2(150, 2, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16 (piso)
			}
		});

		it("deve garantir que extrapolação não resulte em preço abaixo do piso", () => {
			// Caso extremo: 10 CPFs com 600k total = 60k por CPF (no máximo)
			const result = calculatePriceV2(600, 10, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16
			}
		});

		it("deve garantir piso mesmo com quantidades muito grandes", () => {
			// 1 CPF com quantidade muito grande
			const result = calculatePriceV2(1000, 1, testPriceTableV2);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.price).toBeGreaterThanOrEqual(16);
				expect(result.price).toBe(16); // deve ser exatamente 16 (piso)
			}
		});
	});

	describe("casos de erro", () => {
		it("deve retornar erro quando tabela de preços está vazia", () => {
			const emptyTable: PriceTableV2 = {};
			const result = calculatePriceV2(50, 1, emptyTable);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toContain("vazia");
			}
		});

		it("deve retornar erro quando cpfCount é zero ou negativo", () => {
			const result = calculatePriceV2(50, 0, testPriceTableV2);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason).toContain("CPF");
			}
		});

		it("deve retornar erro quando quantity é zero ou negativo", () => {
			const result = calculatePriceV2(0, 1, testPriceTableV2);

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.reason.toLowerCase()).toContain("quantidade");
			}
		});
	});
});

