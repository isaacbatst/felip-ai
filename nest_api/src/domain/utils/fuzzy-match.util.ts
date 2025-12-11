/**
 * Calcula a distância de Levenshtein entre duas strings
 */
export class FuzzyMatchUtil {
  private static levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      const row: number[] = [];
      for (let j = 0; j <= len2; j++) {
        if (i === 0) {
          row[j] = j;
        } else if (j === 0) {
          row[j] = i;
        } else {
          row[j] = 0;
        }
      }
      matrix[i] = row;
    }

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

        currentRow[j] = Math.min(deletion + 1, insertion + 1, substitution + cost);
      }
    }

    const result = matrix[len1]?.[len2];
    return result ?? Infinity;
  }

  private static stringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 && str2.length === 0) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const distance = FuzzyMatchUtil.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    return 1 - distance / maxLength;
  }

  static findBestFuzzyMatch(
    input: string,
    candidates: string[],
    threshold: number = 0.6,
  ): { match: string; similarity: number } | null {
    if (candidates.length === 0) return null;

    let bestMatch: string | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      const similarity = FuzzyMatchUtil.stringSimilarity(input, candidate);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = candidate;
      }
    }

    if (bestMatch && bestSimilarity >= threshold) {
      return { match: bestMatch, similarity: bestSimilarity };
    }

    return null;
  }

  static normalizeForFuzzy(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }
}
