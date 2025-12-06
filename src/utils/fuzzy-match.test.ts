import { describe, expect, it } from "vitest";
import {
	findBestFuzzyMatch,
	levenshteinDistance,
	normalizeForFuzzy,
	stringSimilarity,
} from "./fuzzy-match.js";

describe("fuzzy-match", () => {
	describe("levenshteinDistance", () => {
		it("should return 0 for identical strings", () => {
			expect(levenshteinDistance("latam", "latam")).toBe(0);
			expect(levenshteinDistance("smiles", "smiles")).toBe(0);
		});

		it("should return correct distance for different strings", () => {
			expect(levenshteinDistance("latam", "latm")).toBe(1); // 1 substituição
			expect(levenshteinDistance("smiles", "smile")).toBe(1); // 1 deleção
			expect(levenshteinDistance("azul", "azulz")).toBe(1); // 1 inserção
			expect(levenshteinDistance("latam", "latampass")).toBe(4); // 4 inserções
		});

		it("should return length of string if other is empty", () => {
			expect(levenshteinDistance("latam", "")).toBe(5);
			expect(levenshteinDistance("", "latam")).toBe(5);
		});
	});

	describe("stringSimilarity", () => {
		it("should return 1.0 for identical strings", () => {
			expect(stringSimilarity("latam", "latam")).toBe(1.0);
		});

		it("should return high similarity for small differences", () => {
			const sim = stringSimilarity("latam", "latm");
			expect(sim).toBeGreaterThan(0.7);
			expect(sim).toBeLessThanOrEqual(1.0);
		});

		it("should return low similarity for very different strings", () => {
			const sim = stringSimilarity("latam", "smiles");
			expect(sim).toBeLessThan(0.5);
		});

		it("should handle empty strings", () => {
			expect(stringSimilarity("", "")).toBe(1.0);
			expect(stringSimilarity("latam", "")).toBe(0.0);
			expect(stringSimilarity("", "latam")).toBe(0.0);
		});
	});

	describe("normalizeForFuzzy", () => {
		it("should convert to lowercase", () => {
			expect(normalizeForFuzzy("LATAM")).toBe("latam");
			expect(normalizeForFuzzy("Smiles")).toBe("smiles");
		});

		it("should normalize spaces", () => {
			expect(normalizeForFuzzy("latam  pass")).toBe("latam pass");
			expect(normalizeForFuzzy("  tudo  azul  ")).toBe("tudo azul");
		});

		it("should remove special characters", () => {
			expect(normalizeForFuzzy("caixa+")).toBe("caixa");
			expect(normalizeForFuzzy("latam-pass")).toBe("latampass");
		});

		it("should trim whitespace", () => {
			expect(normalizeForFuzzy("  latam  ")).toBe("latam");
		});
	});

	describe("findBestFuzzyMatch", () => {
		const candidates = ["latam", "smiles", "azul", "livelo", "esfera"];

		it("should find exact match", () => {
			const result = findBestFuzzyMatch("latam", candidates);
			expect(result).not.toBeNull();
			expect(result?.match).toBe("latam");
			expect(result?.similarity).toBe(1.0);
		});

		it("should find match with typo", () => {
			const result = findBestFuzzyMatch("latm", candidates, 0.6);
			expect(result).not.toBeNull();
			expect(result?.match).toBe("latam");
			expect(result?.similarity).toBeGreaterThan(0.6);
		});

		it("should find match with missing character", () => {
			const result = findBestFuzzyMatch("smile", candidates, 0.6);
			expect(result).not.toBeNull();
			expect(result?.match).toBe("smiles");
		});

		it("should return null if no match meets threshold", () => {
			const result = findBestFuzzyMatch("xyz", candidates, 0.6);
			expect(result).toBeNull();
		});

		it("should return null for empty candidates", () => {
			const result = findBestFuzzyMatch("latam", []);
			expect(result).toBeNull();
		});

		it("should handle different thresholds", () => {
			// Com threshold baixo, deve encontrar mesmo com diferenças maiores
			const resultLow = findBestFuzzyMatch("latm", candidates, 0.5);
			expect(resultLow).not.toBeNull();

			// Com threshold alto, pode não encontrar
			const resultHigh = findBestFuzzyMatch("latm", candidates, 0.95);
			expect(resultHigh).toBeNull();
		});
	});
});

