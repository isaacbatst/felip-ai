import type { ProgramOption } from '../interfaces/message-parser.interface';
import { FuzzyMatchUtil } from './fuzzy-match.util';

/**
 * Pure utility class for extracting provider from text using keyword matching.
 * No dependencies, all static methods.
 */
export class ProviderExtractionUtil {
  /**
   * Extract provider ID using keyword matching (no AI)
   */
  static extractProvider(text: string, programs?: ProgramOption[]): number | null {
    if (!programs?.length) return null;

    const normalizedText = ProviderExtractionUtil.normalizeText(text);
    const hasLiminar = normalizedText.includes('liminar');

    // Sort by keyword length (longer = more specific)
    const sortedPrograms = ProviderExtractionUtil.getSortedProgramsBySpecificity(programs);

    // Extract words for fuzzy matching (only needed if exact match fails)
    const words = ProviderExtractionUtil.extractWordsFromText(normalizedText);

    for (const program of sortedPrograms) {
      const isLiminarProgram = program.name.toLowerCase().includes('liminar');

      // Skip LIMINAR programs unless "liminar" is in the message
      if (isLiminarProgram && !hasLiminar) continue;

      // Skip non-LIMINAR programs if "liminar" is explicitly mentioned
      if (!isLiminarProgram && hasLiminar) continue;

      const keywords = ProviderExtractionUtil.getKeywords(program.name);

      // 1. Try exact match first (faster)
      if (keywords.some((kw) => normalizedText.includes(kw))) {
        return program.id;
      }

      // 2. Fallback: fuzzy match for longer keywords
      if (keywords.some((kw) => ProviderExtractionUtil.fuzzyMatchKeyword(words, kw))) {
        return program.id;
      }
    }

    return null;
  }

  /**
   * Extract words from normalized text for fuzzy matching
   * Filters out words with less than 3 characters to avoid false positives
   */
  static extractWordsFromText(normalizedText: string): string[] {
    return normalizedText.split(' ').filter((word) => word.length >= 3);
  }

  /**
   * Check if any word in the text fuzzy matches the keyword
   * Only applies to keywords longer than 3 characters to avoid false positives with short keywords like "AA", "GOL"
   */
  static fuzzyMatchKeyword(words: string[], keyword: string, threshold: number = 0.8): boolean {
    // For short keywords (<=3 chars), require exact match
    if (keyword.length <= 3) return false;

    return words.some((word) => {
      const similarity = FuzzyMatchUtil.stringSimilarity(word, keyword);
      return similarity >= threshold;
    });
  }

  /**
   * Normalize text for keyword matching:
   * - lowercase
   * - remove accents
   * - replace special chars with space
   * - normalize whitespace
   */
  static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Get keywords from program name by splitting on '/'
   */
  static getKeywords(programName: string): string[] {
    return programName
      .split('/')
      .map((alias) => ProviderExtractionUtil.normalizeText(alias))
      .filter(Boolean);
  }

  /**
   * Sort programs by keyword specificity (longer keywords first)
   */
  static getSortedProgramsBySpecificity(programs: ProgramOption[]): ProgramOption[] {
    return [...programs].sort((a, b) => {
      const maxLenA = Math.max(...ProviderExtractionUtil.getKeywords(a.name).map((k) => k.length));
      const maxLenB = Math.max(...ProviderExtractionUtil.getKeywords(b.name).map((k) => k.length));
      return maxLenB - maxLenA; // Longer keywords first
    });
  }
}
