/**
 * Calcula a distância de Levenshtein entre duas strings
 * A distância de Levenshtein é o número mínimo de edições (inserções, deleções, substituições)
 * necessárias para transformar uma string em outra
 * 
 * @param str1 - Primeira string
 * @param str2 - Segunda string
 * @returns Distância de Levenshtein (0 = strings idênticas, maior = mais diferente)
 */
export function levenshteinDistance(str1: string, str2: string): number {
	const len1 = str1.length;
	const len2 = str2.length;

	// Se uma das strings está vazia, retorna o comprimento da outra
	if (len1 === 0) return len2;
	if (len2 === 0) return len1;

	// Cria matriz para armazenar distâncias
	const matrix: number[][] = [];
	
	// Inicializa matriz completa
	for (let i = 0; i <= len1; i++) {
		const row: number[] = [];
		for (let j = 0; j <= len2; j++) {
			if (i === 0) {
				row[j] = j;
			} else if (j === 0) {
				row[j] = i;
			} else {
				row[j] = 0; // Será calculado abaixo
			}
		}
		matrix[i] = row;
	}

	// Preenche o resto da matriz
	for (let i = 1; i <= len1; i++) {
		for (let j = 1; j <= len2; j++) {
			const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
			const row = matrix[i - 1];
			const currentRow = matrix[i];
			const prevRow = matrix[i - 1];
			
			if (!row || !currentRow || !prevRow) {
				continue;
			}
			
			const deletion = row[j] ?? Infinity;
			const insertion = currentRow[j - 1] ?? Infinity;
			const substitution = prevRow[j - 1] ?? Infinity;
			
			currentRow[j] = Math.min(
				deletion + 1, // deleção
				insertion + 1, // inserção
				substitution + cost // substituição
			);
		}
	}

	const result = matrix[len1]?.[len2];
	return result ?? Infinity;
}

/**
 * Calcula a similaridade entre duas strings usando distância de Levenshtein
 * Retorna um valor entre 0 (completamente diferente) e 1 (idênticas)
 * 
 * @param str1 - Primeira string
 * @param str2 - Segunda string
 * @returns Similaridade normalizada (0-1)
 */
export function stringSimilarity(str1: string, str2: string): number {
	if (str1 === str2) return 1.0;
	if (str1.length === 0 && str2.length === 0) return 1.0;
	if (str1.length === 0 || str2.length === 0) return 0.0;

	const distance = levenshteinDistance(str1, str2);
	const maxLength = Math.max(str1.length, str2.length);
	
	// Normaliza a distância para um valor entre 0 e 1
	return 1 - distance / maxLength;
}

/**
 * Encontra a melhor correspondência fuzzy em uma lista de strings
 * 
 * @param input - String de entrada para buscar
 * @param candidates - Lista de strings candidatas
 * @param threshold - Limiar mínimo de similaridade (0-1). Padrão: 0.6
 * @returns Objeto com a melhor correspondência ou null se nenhuma atender ao threshold
 */
export function findBestFuzzyMatch(
	input: string,
	candidates: string[],
	threshold: number = 0.6
): { match: string; similarity: number } | null {
	if (candidates.length === 0) return null;

	let bestMatch: string | null = null;
	let bestSimilarity = 0;

	for (const candidate of candidates) {
		const similarity = stringSimilarity(input, candidate);
		if (similarity > bestSimilarity) {
			bestSimilarity = similarity;
			bestMatch = candidate;
		}
	}

	// Retorna apenas se a similaridade atender ao threshold
	if (bestMatch && bestSimilarity >= threshold) {
		return { match: bestMatch, similarity: bestSimilarity };
	}

	return null;
}

/**
 * Normaliza uma string para comparação fuzzy
 * Remove espaços extras, converte para lowercase e remove caracteres especiais comuns
 * 
 * @param str - String para normalizar
 * @returns String normalizada
 */
export function normalizeForFuzzy(str: string): string {
	return str
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ") // Normaliza espaços múltiplos
		.replace(/[^\w\s]/g, "") // Remove caracteres especiais (exceto letras, números e espaços)
		.trim();
}

