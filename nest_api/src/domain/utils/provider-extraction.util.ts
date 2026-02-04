import type { ProgramOption } from '../interfaces/message-parser.interface';

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

    for (const program of sortedPrograms) {
      const isLiminarProgram = program.name.toLowerCase().includes('liminar');

      // Skip LIMINAR programs unless "liminar" is in the message
      if (isLiminarProgram && !hasLiminar) continue;

      // Skip non-LIMINAR programs if "liminar" is explicitly mentioned
      if (!isLiminarProgram && hasLiminar) continue;

      const keywords = ProviderExtractionUtil.getKeywords(program.name);
      if (keywords.some((kw) => normalizedText.includes(kw))) {
        return program.id;
      }
    }

    return null;
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
