/**
 * Programas de milhas aéreas existentes no Brasil
 * 
 * Notas:
 * - MULTIPLUS foi incorporado ao LATAM Pass em outubro de 2019
 * - LATAM Pass é o programa de fidelidade oficial da LATAM Airlines
 * - "LATAM" (companhia) mencionado no contexto de milhas refere-se ao LATAM Pass
 */
export const BRAZILIAN_MILES_PROGRAMS = [
	"LATAM_PASS", // Programa de fidelidade da LATAM Airlines (unificou Multiplus em 2019)
	"SMILES", // Programa de fidelidade da Gol
	"TUDO_AZUL", // Programa de fidelidade da Azul
	"LIVELO", // Programa de pontos independente (Banco do Brasil e Bradesco)
	"ESFERA", // Programa de pontos do Santander
	"INTER_LOOP", // Programa de pontos do Banco Inter
	"ITAU_SEMPRE_PRESENTE", // Pontos Itaú que podem ser transferidos
	"CAIXA_ELO", // Programa de pontos dos cartões Caixa (Elo)
	"CAIXA_MAIS", // Programa de pontos dos cartões Caixa (Mais)
] as const;

export type MilesProgram = (typeof BRAZILIAN_MILES_PROGRAMS)[number];

/**
 * Mapeamento de variações de nomes (em lowercase) para programas padronizados
 * Todas as chaves devem estar em lowercase pois normalizamos antes de acessar
 */
const PROGRAM_ALIASES: Record<string, MilesProgram> = {
	// LATAM Pass - programa de fidelidade da LATAM Airlines (unificou Multiplus em 2019)
	"latam pass": "LATAM_PASS",
	latampass: "LATAM_PASS",
	latam: "LATAM_PASS", // Quando mencionado no contexto de milhas, refere-se ao LATAM Pass
	"latam fidelidade": "LATAM_PASS",
	
	// Multiplus (obsoleto desde 2019, redirecionado para LATAM Pass)
	multiplus: "LATAM_PASS",
	"multi plus": "LATAM_PASS",
	"multiplus tam": "LATAM_PASS",
	tam: "LATAM_PASS", // TAM foi incorporada pela LATAM
	
	// Smiles - programa de fidelidade da Gol
	smiles: "SMILES",
	"smiles gol": "SMILES",
	"smiles gol linhas aéreas": "SMILES",
	gol: "SMILES",
	
	// TudoAzul - programa de fidelidade da Azul
	"tudo azul": "TUDO_AZUL",
	tudoazul: "TUDO_AZUL",
	azul: "TUDO_AZUL",
	
	// Livelo - programa de pontos independente (Banco do Brasil e Bradesco)
	livelo: "LIVELO",
	
	// Esfera - programa de pontos do Santander
	esfera: "ESFERA",
	
	// Inter Loop - programa de pontos do Banco Inter
	"inter loop": "INTER_LOOP",
	interloop: "INTER_LOOP",
	inter: "INTER_LOOP",
	"banco inter": "INTER_LOOP",
	
	// Itaú Sempre Presente - pontos que podem ser transferidos
	"itau sempre presente": "ITAU_SEMPRE_PRESENTE",
	"itaú sempre presente": "ITAU_SEMPRE_PRESENTE",
	itausemprepresente: "ITAU_SEMPRE_PRESENTE",
	itau: "ITAU_SEMPRE_PRESENTE",
	"itau pontos": "ITAU_SEMPRE_PRESENTE",
	
	// Caixa Elo - programa de pontos dos cartões Caixa
	"caixa elo": "CAIXA_ELO",
	caixaelo: "CAIXA_ELO",
	elo: "CAIXA_ELO",
	
	// Caixa Mais - programa de pontos dos cartões Caixa
	"caixa mais": "CAIXA_MAIS",
	caixamais: "CAIXA_MAIS",
	"caixa+": "CAIXA_MAIS",
};

import { findBestFuzzyMatch, normalizeForFuzzy } from "./fuzzy-match.js";

/**
 * Normaliza o nome de um programa de milhas para o formato padronizado
 * Usa busca exata, parcial e fuzzy matching para tolerar erros de digitação
 * 
 * @param programName - Nome do programa mencionado na mensagem
 * @returns Programa padronizado ou null se não for reconhecido
 */
export function normalizeMilesProgram(programName: string | null | undefined): MilesProgram | null {
	if (!programName) {
		return null;
	}

	// Normaliza para lowercase e remove espaços extras
	const normalized = programName.trim().toLowerCase().replace(/\s+/g, " ");
	
	// 1. Verifica primeiro no mapeamento de aliases (busca exata)
	const aliasMatch = PROGRAM_ALIASES[normalized];
	if (aliasMatch) {
		return aliasMatch;
	}

	// 2. Busca parcial: verifica se algum alias está contido no texto normalizado ou vice-versa
	for (const [alias, program] of Object.entries(PROGRAM_ALIASES)) {
		// Remove espaços do alias para comparação mais flexível
		const aliasNormalized = alias.replace(/\s+/g, "");
		const inputNormalized = normalized.replace(/\s+/g, "");
		
		if (
			normalized.includes(alias) ||
			alias.includes(normalized) ||
			inputNormalized.includes(aliasNormalized) ||
			aliasNormalized.includes(inputNormalized)
		) {
			return program;
		}
	}

	// 3. Fuzzy matching: busca por similaridade para tolerar erros de digitação
	// Normaliza a entrada para comparação fuzzy (remove caracteres especiais)
	const fuzzyNormalized = normalizeForFuzzy(normalized);
	const aliases = Object.keys(PROGRAM_ALIASES);
	
	// Busca fuzzy match com threshold de 0.7 (70% de similaridade)
	const fuzzyMatch = findBestFuzzyMatch(fuzzyNormalized, aliases, 0.7);
	if (fuzzyMatch) {
		const matchedProgram = PROGRAM_ALIASES[fuzzyMatch.match];
		if (matchedProgram) {
			return matchedProgram;
		}
	}

	// 4. Se ainda não encontrou, tenta fuzzy matching direto nos nomes dos programas
	// (sem passar pelos aliases, para casos onde o nome do programa foi digitado diretamente)
	const programNames = BRAZILIAN_MILES_PROGRAMS.map(p => p.toLowerCase().replace(/_/g, " "));
	const programFuzzyMatch = findBestFuzzyMatch(fuzzyNormalized, programNames, 0.7);
	if (programFuzzyMatch) {
		// Mapeia de volta para o programa correto
		const matchedProgram = BRAZILIAN_MILES_PROGRAMS.find(
			p => p.toLowerCase().replace(/_/g, " ") === programFuzzyMatch.match
		);
		return matchedProgram ?? null;
	}

	// Se não encontrou nenhuma correspondência, retorna null
	return null;
}

/**
 * Verifica se um programa de milhas é válido
 */
export function isValidMilesProgram(program: string | null | undefined): program is MilesProgram {
	if (!program) {
		return false;
	}
	return BRAZILIAN_MILES_PROGRAMS.includes(program as MilesProgram);
}

