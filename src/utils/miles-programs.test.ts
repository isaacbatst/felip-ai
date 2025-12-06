import { describe, expect, it } from "vitest";
import {
	BRAZILIAN_MILES_PROGRAMS,
	isValidMilesProgram,
	normalizeMilesProgram,
	type MilesProgram,
} from "./miles-programs.js";

describe("miles-programs", () => {
	describe("normalizeMilesProgram", () => {
		it("should normalize LATAM variations to LATAM_PASS", () => {
			// LATAM (companhia) mencionado no contexto de milhas refere-se ao LATAM Pass
			expect(normalizeMilesProgram("LATAM")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("latam")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("LATAM PASS")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("latam pass")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("latampass")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("latam fidelidade")).toBe("LATAM_PASS");
		});

		it("should normalize MULTIPLUS (obsoleto) to LATAM_PASS", () => {
			// Multiplus foi incorporado ao LATAM Pass em 2019
			expect(normalizeMilesProgram("MULTIPLUS")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("multiplus")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("MULTI PLUS")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("multiplus tam")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("TAM")).toBe("LATAM_PASS");
		});

		it("should normalize SMILES variations", () => {
			expect(normalizeMilesProgram("SMILES")).toBe("SMILES");
			expect(normalizeMilesProgram("smiles")).toBe("SMILES");
			expect(normalizeMilesProgram("SMILES GOL")).toBe("SMILES");
			expect(normalizeMilesProgram("GOL")).toBe("SMILES");
		});

		it("should normalize TUDO_AZUL variations", () => {
			expect(normalizeMilesProgram("TUDO AZUL")).toBe("TUDO_AZUL");
			expect(normalizeMilesProgram("tudo azul")).toBe("TUDO_AZUL");
			expect(normalizeMilesProgram("TUDOAZUL")).toBe("TUDO_AZUL");
			expect(normalizeMilesProgram("azul")).toBe("TUDO_AZUL");
			expect(normalizeMilesProgram("AZUL")).toBe("TUDO_AZUL");
		});


		it("should normalize LIVELO variations", () => {
			expect(normalizeMilesProgram("LIVELO")).toBe("LIVELO");
			expect(normalizeMilesProgram("livelo")).toBe("LIVELO");
			expect(normalizeMilesProgram("Livelo")).toBe("LIVELO");
		});

		it("should normalize ESFERA variations", () => {
			expect(normalizeMilesProgram("ESFERA")).toBe("ESFERA");
			expect(normalizeMilesProgram("esfera")).toBe("ESFERA");
			expect(normalizeMilesProgram("Esfera")).toBe("ESFERA");
		});

		it("should normalize INTER_LOOP variations", () => {
			expect(normalizeMilesProgram("INTER LOOP")).toBe("INTER_LOOP");
			expect(normalizeMilesProgram("inter loop")).toBe("INTER_LOOP");
			expect(normalizeMilesProgram("INTERLOOP")).toBe("INTER_LOOP");
			expect(normalizeMilesProgram("INTER")).toBe("INTER_LOOP");
			expect(normalizeMilesProgram("BANCO INTER")).toBe("INTER_LOOP");
		});

		it("should normalize ITAU_SEMPRE_PRESENTE variations", () => {
			expect(normalizeMilesProgram("ITAU SEMPRE PRESENTE")).toBe("ITAU_SEMPRE_PRESENTE");
			expect(normalizeMilesProgram("itau sempre presente")).toBe("ITAU_SEMPRE_PRESENTE");
			expect(normalizeMilesProgram("ITAÚ SEMPRE PRESENTE")).toBe("ITAU_SEMPRE_PRESENTE");
			expect(normalizeMilesProgram("ITAU")).toBe("ITAU_SEMPRE_PRESENTE");
			expect(normalizeMilesProgram("ITAU PONTOS")).toBe("ITAU_SEMPRE_PRESENTE");
		});

		it("should normalize CAIXA_ELO variations", () => {
			expect(normalizeMilesProgram("CAIXA ELO")).toBe("CAIXA_ELO");
			expect(normalizeMilesProgram("caixa elo")).toBe("CAIXA_ELO");
			expect(normalizeMilesProgram("CAIXAELO")).toBe("CAIXA_ELO");
			expect(normalizeMilesProgram("ELO")).toBe("CAIXA_ELO");
		});

		it("should normalize CAIXA_MAIS variations", () => {
			expect(normalizeMilesProgram("CAIXA MAIS")).toBe("CAIXA_MAIS");
			expect(normalizeMilesProgram("caixa mais")).toBe("CAIXA_MAIS");
			expect(normalizeMilesProgram("CAIXAMAIS")).toBe("CAIXA_MAIS");
			expect(normalizeMilesProgram("CAIXA+")).toBe("CAIXA_MAIS");
		});

		it("should return null for null or undefined", () => {
			expect(normalizeMilesProgram(null)).toBeNull();
			expect(normalizeMilesProgram(undefined)).toBeNull();
			expect(normalizeMilesProgram("")).toBeNull();
		});

		it("should return null for unrecognized programs", () => {
			expect(normalizeMilesProgram("UNKNOWN_PROGRAM")).toBeNull();
			expect(normalizeMilesProgram("invalid")).toBeNull();
		});

		it("should handle partial matches", () => {
			expect(normalizeMilesProgram("latam")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("smiles")).toBe("SMILES");
		});

		it("should handle typos using fuzzy matching", () => {
			// Erros de digitação comuns
			expect(normalizeMilesProgram("latm")).toBe("LATAM_PASS"); // falta 'a'
			expect(normalizeMilesProgram("latam pas")).toBe("LATAM_PASS"); // falta 's'
			expect(normalizeMilesProgram("smile")).toBe("SMILES"); // falta 's'
			expect(normalizeMilesProgram("smiles")).toBe("SMILES"); // já funciona por busca parcial
			expect(normalizeMilesProgram("azul")).toBe("TUDO_AZUL"); // nome parcial (busca parcial)
			expect(normalizeMilesProgram("livlo")).toBe("LIVELO"); // falta 'e'
			expect(normalizeMilesProgram("esfer")).toBe("ESFERA"); // falta 'a'
			expect(normalizeMilesProgram("esferaa")).toBe("ESFERA"); // 'a' extra
		});

		it("should handle extra characters using fuzzy matching", () => {
			expect(normalizeMilesProgram("latamm")).toBe("LATAM_PASS"); // 'm' extra
			expect(normalizeMilesProgram("smiless")).toBe("SMILES"); // 's' extra
		});

		it("should handle special characters removal in fuzzy matching", () => {
			expect(normalizeMilesProgram("latam-pass")).toBe("LATAM_PASS");
			expect(normalizeMilesProgram("caixa+")).toBe("CAIXA_MAIS");
			expect(normalizeMilesProgram("tudo.azul")).toBe("TUDO_AZUL");
		});

		it("should not match strings that are too different", () => {
			// Strings muito diferentes não devem fazer match
			expect(normalizeMilesProgram("xyzabc")).toBeNull();
			expect(normalizeMilesProgram("programa123")).toBeNull();
		});
	});

	describe("isValidMilesProgram", () => {
		it("should return true for valid programs", () => {
			for (const program of BRAZILIAN_MILES_PROGRAMS) {
				expect(isValidMilesProgram(program)).toBe(true);
			}
		});

		it("should return false for invalid programs", () => {
			expect(isValidMilesProgram("INVALID")).toBe(false);
			expect(isValidMilesProgram(null)).toBe(false);
			expect(isValidMilesProgram(undefined)).toBe(false);
			expect(isValidMilesProgram("")).toBe(false);
		});
	});

	describe("BRAZILIAN_MILES_PROGRAMS", () => {
		it("should contain expected programs", () => {
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("LATAM_PASS");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("SMILES");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("TUDO_AZUL");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("LIVELO");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("ESFERA");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("INTER_LOOP");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("ITAU_SEMPRE_PRESENTE");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("CAIXA_ELO");
			expect(BRAZILIAN_MILES_PROGRAMS).toContain("CAIXA_MAIS");
		});

		it("should not contain obsolete programs", () => {
			expect(BRAZILIAN_MILES_PROGRAMS).not.toContain("LATAM");
			expect(BRAZILIAN_MILES_PROGRAMS).not.toContain("MULTIPLUS");
		});

		it("should have correct total number of programs", () => {
			expect(BRAZILIAN_MILES_PROGRAMS.length).toBe(9);
		});
	});
});

