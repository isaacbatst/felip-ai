import { PriceNormalizationUtil } from './price-normalization.util';

describe('PriceNormalizationUtil', () => {
  describe('comma as decimal separator', () => {
    it.each([
      ['15,5', 15.5],
      ['20,00', 20],
      ['14,75', 14.75],
      ['25,50', 25.5],
      ['16,50', 16.5],
      ['24,00', 24],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(PriceNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('dot as decimal separator', () => {
    it.each([
      ['15.5', 15.5],
      ['20.50', 20.5],
      ['25.50', 25.5],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(PriceNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('currency symbol stripping', () => {
    it.each([
      ['R$1', 1],
      ['R$ 20', 20],
      ['R$15,5', 15.5],
      ['$20.50', 20.5],
      ['14$', 14],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(PriceNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('plain numbers', () => {
    it.each([
      ['15', 15],
      ['20', 20],
      ['1', 1],
      ['16', 16],
      ['17', 17],
      ['25', 25],
    ])('parses "%s" -> %d', (input, expected) => {
      expect(PriceNormalizationUtil.parse(input)).toBe(expected);
    });
  });

  describe('invalid inputs', () => {
    it.each([
      [''],
      ['abc'],
      ['0'],
      ['-5'],
    ])('rejects "%s" (returns null)', (input) => {
      expect(PriceNormalizationUtil.parse(input)).toBeNull();
    });
  });
});
