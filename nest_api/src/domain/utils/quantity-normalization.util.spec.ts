import { QuantityNormalizationUtil } from './quantity-normalization.util';

describe('QuantityNormalizationUtil', () => {
  describe('k suffix with base < 1000 (k means x1000)', () => {
    it.each([
      ['242k', 242000],
      ['50k', 50000],
      ['100k', 100000],
      ['84k', 84000],
      ['80k', 80000],
      ['150k', 150000],
      ['100K', 100000],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(QuantityNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('k suffix with decimal base < 1000 (k means x1000)', () => {
    it.each([
      ['21,5k', 21500],
      ['26.1k', 26100],
      ['123,7k', 123700],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(QuantityNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('k suffix with base >= 1000 (k is decorative)', () => {
    it.each([
      ['14.321k', 14321],
      ['32.765k', 32765],
      ['109,916k', 109916],
      ['302,900k', 302900],
      ['6.800k', 6800],
    ])('parses "%s" -> %d (k decorative)', (input, expected) => {
      expect(QuantityNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('kk and M suffix (millions)', () => {
    it.each([
      ['30kk', 30000000],
      ['30KK', 30000000],
      ['1kk', 1000000],
      ['1,5kk', 1500000],
      ['2M', 2000000],
      ['2m', 2000000],
      ['1.5M', 1500000],
      ['2,5M', 2500000],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(QuantityNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('no suffix, value >= 1000 (valid)', () => {
    it.each([
      ['84000', 84000],
      ['26200', 26200],
      ['49203', 49203],
      ['6800', 6800],
      ['1000', 1000],
      ['26.200', 26200],
      ['14.321', 14321],
      ['302,900', 302900],
      ['6.800', 6800],
      ['1.000', 1000],
      ['1,000', 1000],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(QuantityNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('no suffix, value < 1000 (rejected - trap detection)', () => {
    it.each([
      ['10'],
      ['15'],
      ['84'],
      ['277'],
      ['999'],
      ['81,5'],
      ['140,5'],
      ['6,7'],
      ['12.3'],
    ])('rejects "%s" (returns null)', (input) => {
      expect(QuantityNormalizationUtil.parse(input)).toBeNull();
    });
  });

  describe('k suffix with decimal base producing < 1000 result', () => {
    it.each([
      ['0,5k'],
      ['0.5k'],
    ])('rejects "%s" (below minimum)', (input) => {
      expect(QuantityNormalizationUtil.parse(input)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('parses "999k" -> 999000', () => {
      expect(QuantityNormalizationUtil.parse('999k')).toBe(999000);
    });

    it('parses "1000k" -> 1000 (k decorative, base >= 1000)', () => {
      expect(QuantityNormalizationUtil.parse('1000k')).toBe(1000);
    });

    it('parses " 242k " with whitespace -> 242000', () => {
      expect(QuantityNormalizationUtil.parse(' 242k ')).toBe(242000);
    });
  });

  describe('fractions (trap detection)', () => {
    it.each([
      ['1/4'],
      ['1/2'],
      ['3/4'],
      ['1/4k'],
      ['1/2k'],
      ['1/4kk'],
      ['1/2M'],
    ])('rejects fraction "%s" (returns null)', (input) => {
      expect(QuantityNormalizationUtil.parse(input)).toBeNull();
    });
  });

  describe('invalid inputs', () => {
    it.each([
      [''],
      ['abc'],
      ['0'],
      ['0k'],
      ['-100k'],
      ['-50'],
    ])('rejects "%s" (returns null)', (input) => {
      expect(QuantityNormalizationUtil.parse(input)).toBeNull();
    });
  });
});
