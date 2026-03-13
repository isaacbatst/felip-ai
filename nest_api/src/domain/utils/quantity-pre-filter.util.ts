/**
 * Conservative regex-based quantity estimator.
 * Extracts approximate quantity from raw message text (NOT normalized text).
 * Returns null when uncertain — caller should proceed to LLM.
 */
export class QuantityPreFilterUtil {
  static estimate(text: string): number | null {
    const lower = text.toLowerCase();

    // Order matters: check kk before k, mil before m
    const patterns: { regex: RegExp; multiplier: number }[] = [
      { regex: /(?<![.,\d])(\d+)\s*kk/g, multiplier: 1_000_000 },
      { regex: /(?<![.,\d])(\d+)\s*mil\b/g, multiplier: 1_000 },
      { regex: /(?<![.,\d])(\d+)\s*m(?!\w)/g, multiplier: 1_000_000 },
      { regex: /(?<![.,\d])(\d+)[.,]000(?!\d)/g, multiplier: 1_000 },
      { regex: /(?<![.,\d])(\d+)\s*k(?!k)/g, multiplier: 1_000 },
    ];

    let largest: number | null = null;

    for (const { regex, multiplier } of patterns) {
      let match;
      while ((match = regex.exec(lower)) !== null) {
        const base = parseInt(match[1], 10);
        const value = base * multiplier;
        if (value >= 1000 && (largest === null || value > largest)) {
          largest = value;
        }
      }
    }

    return largest;
  }
}
