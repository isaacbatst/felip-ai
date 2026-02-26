import { SeparatorNormalizationUtil } from './separator-normalization.util';

describe('SeparatorNormalizationUtil', () => {
  describe('both dot and comma present (last separator is decimal)', () => {
    it.each([
      ['1.500,50', '1500.50'],
      ['1,500.50', '1500.50'],
      ['1.000,5', '1000.5'],
    ])('normalizes "%s" -> "%s"', (input, expected) => {
      expect(SeparatorNormalizationUtil.normalize(input)).toBe(expected);
    });
  });

  describe('only comma', () => {
    it.each([
      ['302,900', '302900'],
      ['1,000', '1000'],
      ['15,5', '15.5'],
      ['81,5', '81.5'],
      ['20,00', '20.00'],
      ['14,75', '14.75'],
    ])('normalizes "%s" -> "%s"', (input, expected) => {
      expect(SeparatorNormalizationUtil.normalize(input)).toBe(expected);
    });
  });

  describe('only dot', () => {
    it.each([
      ['14.321', '14321'],
      ['6.800', '6800'],
      ['1.000', '1000'],
      ['12.3', '12.3'],
      ['15.50', '15.50'],
      ['26.200', '26200'],
    ])('normalizes "%s" -> "%s"', (input, expected) => {
      expect(SeparatorNormalizationUtil.normalize(input)).toBe(expected);
    });
  });

  describe('no separators', () => {
    it.each([
      ['84000', '84000'],
      ['242', '242'],
      ['15', '15'],
    ])('returns "%s" unchanged', (input, expected) => {
      expect(SeparatorNormalizationUtil.normalize(input)).toBe(expected);
    });
  });
});
