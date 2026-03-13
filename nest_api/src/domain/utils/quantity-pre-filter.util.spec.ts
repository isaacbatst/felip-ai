import { QuantityPreFilterUtil } from './quantity-pre-filter.util';

describe('QuantityPreFilterUtil', () => {
  describe('k suffix (integer base)', () => {
    it.each([
      ['smiles 242k 1cpf', 242000],
      ['latam 50k 2cpf', 50000],
      ['azul 100k 1cpf', 100000],
      ['smiles 80k 1cpf 20', 80000],
      ['SMILES 50K 1CPF', 50000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('kk suffix (millions)', () => {
    it.each([
      ['smiles 1kk 1cpf', 1000000],
      ['latam 2kk', 2000000],
      ['smiles 30kk', 30000000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('m suffix (millions)', () => {
    it.each([
      ['smiles 2m 1cpf', 2000000],
      ['latam 1M', 1000000],
      ['azul 5m', 5000000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('mil suffix', () => {
    it.each([
      ['smiles 50mil 1cpf', 50000],
      ['latam 100mil 2cpf', 100000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('dot-thousands (\\d+.000)', () => {
    it.each([
      ['smiles 50.000 1cpf', 50000],
      ['latam 100.000 2cpf', 100000],
      ['azul 30.000 1cpf', 30000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('comma-thousands (\\d+,000)', () => {
    it.each([
      ['smiles 50,000 1cpf', 50000],
      ['latam 100,000 2cpf', 100000],
    ])('estimate("%s") -> %d', (input, expected) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(expected);
    });
  });

  describe('conservative: returns null for ambiguous patterns', () => {
    it.each([
      ['smiles 84000 1cpf'],
      ['latam 21,5k 1cpf'],
      ['smiles 302,900k'],
      ['random text no numbers'],
      ['smiles 15 1cpf'],
      ['32.765k 1cpf'],
    ])('estimate("%s") -> null', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBeNull();
    });
  });

  describe('word boundary: mil not followed by word chars', () => {
    it.each([
      ['smiles 50milhas'],
      ['50milhoes'],
    ])('estimate("%s") -> null (mil not isolated)', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBeNull();
    });
  });

  describe('m suffix: not followed by word chars', () => {
    it.each([
      ['smiles min 50k'],
    ])('estimate("%s") -> 50000 (m in "min" is not a suffix)', (input) => {
      expect(QuantityPreFilterUtil.estimate(input)).toBe(50000);
    });
  });

  describe('multiple candidates: returns largest', () => {
    it('returns largest when multiple patterns match', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 50k e 30k')).toBe(50000);
    });

    it('returns largest across different suffixes', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 1kk e 50k')).toBe(1000000);
    });
  });

  describe('edge cases', () => {
    it('handles whitespace between number and suffix', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 50 k 1cpf')).toBe(50000);
    });

    it('returns null for empty string', () => {
      expect(QuantityPreFilterUtil.estimate('')).toBeNull();
    });

    it('returns null when estimated value < 1000', () => {
      expect(QuantityPreFilterUtil.estimate('smiles 0k')).toBeNull();
    });
  });
});
