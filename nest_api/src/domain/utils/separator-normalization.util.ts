/**
 * Normalizes separator characters in a numeric string.
 *
 * Rules:
 * - If both dot and comma present: last separator is decimal, others are thousands
 * - dot/comma followed by exactly 3 digits = thousands separator (remove)
 * - dot/comma followed by 1-2 digits = decimal separator (replace with dot)
 */
export class SeparatorNormalizationUtil {
  static normalize(str: string): string {
    if (str.includes('.') && str.includes(',')) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastComma > lastDot) {
        return str.replace(/\./g, '').replace(',', '.');
      }
      return str.replace(/,/g, '');
    }

    if (str.includes(',')) {
      const match = str.match(/,(\d+)$/);
      if (match && match[1].length === 3) {
        return str.replace(/,/g, '');
      }
      return str.replace(',', '.');
    }

    if (str.includes('.')) {
      const match = str.match(/\.(\d+)$/);
      if (match && match[1].length === 3) {
        return str.replace(/\./g, '');
      }
      return str;
    }

    return str;
  }
}
