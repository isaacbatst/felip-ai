import { SeparatorNormalizationUtil } from './separator-normalization.util';

/**
 * Pure utility for normalizing raw price strings to float values.
 *
 * Handles:
 * - Currency symbols: R$, $ (prefix and suffix)
 * - Decimal separators: comma (Brazilian) and dot
 * - Thousands separators: dot/comma followed by exactly 3 digits
 */
export class PriceNormalizationUtil {
  static parse(raw: string): number | null {
    if (!raw || typeof raw !== 'string') return null;

    let cleaned = raw.trim();
    if (!cleaned) return null;

    // Strip currency symbols (prefix and suffix)
    cleaned = cleaned.replace(/R\$\s*/gi, '').replace(/\$/g, '').trim();
    if (!cleaned) return null;

    cleaned = SeparatorNormalizationUtil.normalize(cleaned);

    const value = parseFloat(cleaned);
    if (!isFinite(value) || value <= 0) return null;

    return value;
  }
}
