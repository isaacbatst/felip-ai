import { SeparatorNormalizationUtil } from './separator-normalization.util';

/**
 * Pure utility for normalizing raw quantity strings to absolute mile counts.
 *
 * Rules:
 * 1. Detect suffix: kk/M = millions, k = thousands (conditionally)
 * 2. Normalize separators (dot/comma disambiguation)
 * 3. If "k" suffix and base >= 1000: k is decorative (e.g. "32.765k" = 32765)
 * 4. If "k" suffix and base < 1000: k means x1000 (e.g. "242k" = 242000)
 * 5. No suffix: value as-is
 * 6. Reject if final result < 1000
 */
export class QuantityNormalizationUtil {
  static parse(raw: string): number | null {
    if (!raw || typeof raw !== 'string') return null;

    let trimmed = raw.trim().toLowerCase();
    if (!trimmed) return null;

    let suffix: 'kk' | 'k' | 'm' | null = null;
    if (trimmed.endsWith('kk')) {
      suffix = 'kk';
      trimmed = trimmed.slice(0, -2);
    } else if (trimmed.endsWith('m')) {
      suffix = 'm';
      trimmed = trimmed.slice(0, -1);
    } else if (trimmed.endsWith('k')) {
      suffix = 'k';
      trimmed = trimmed.slice(0, -1);
    }

    trimmed = SeparatorNormalizationUtil.normalize(trimmed);

    // Reject strings with non-numeric characters (e.g. fractions like "1/4")
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

    const value = parseFloat(trimmed);
    if (!isFinite(value) || value <= 0) return null;

    let result: number;

    if (suffix === 'kk' || suffix === 'm') {
      result = value * 1_000_000;
    } else if (suffix === 'k') {
      result = value >= 1000 ? value : value * 1000;
    } else {
      result = value;
    }

    result = Math.round(result);

    if (result < 1000) return null;

    return result;
  }
}
