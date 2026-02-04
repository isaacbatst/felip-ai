import { ProviderExtractionUtil } from './provider-extraction.util';
import type { ProgramOption } from '../interfaces/message-parser.interface';

describe('ProviderExtractionUtil', () => {
  // Sample test data from miles_programs.csv
  const samplePrograms: ProgramOption[] = [
    { id: 1, name: 'SMILES' },
    { id: 3, name: 'AEROPLAN / AIRCANADA' },
    { id: 13, name: 'AMERICAN AIRLINES / AA / AADVANTAGE' },
    { id: 18, name: 'AZUL INTERLINE/AZUL PELO MUNDO/AZUL VIAGENS' },
    { id: 19, name: 'LATAM' },
    { id: 20, name: 'AZUL/TUDO AZUL' },
    { id: 21, name: 'SMILES LIMINAR' },
    { id: 22, name: 'LATAM LIMINAR' },
    { id: 23, name: 'AZUL LIMINAR' },
  ];

  describe('normalizeText', () => {
    it('should convert text to lowercase', () => {
      expect(ProviderExtractionUtil.normalizeText('SMILES')).toBe('smiles');
      expect(ProviderExtractionUtil.normalizeText('LATAM')).toBe('latam');
    });

    it('should remove accents (NFD normalization)', () => {
      expect(ProviderExtractionUtil.normalizeText('São Paulo')).toBe('sao paulo');
      expect(ProviderExtractionUtil.normalizeText('café')).toBe('cafe');
      expect(ProviderExtractionUtil.normalizeText('Ação')).toBe('acao');
    });

    it('should replace special characters with space', () => {
      expect(ProviderExtractionUtil.normalizeText('AA/AADVANTAGE')).toBe('aa aadvantage');
      expect(ProviderExtractionUtil.normalizeText('AZUL-TEST')).toBe('azul test');
      expect(ProviderExtractionUtil.normalizeText('hello@world.com')).toBe('hello world com');
    });

    it('should normalize whitespace', () => {
      expect(ProviderExtractionUtil.normalizeText('AZUL   INTERLINE')).toBe('azul interline');
      expect(ProviderExtractionUtil.normalizeText('  SMILES  ')).toBe('smiles');
      expect(ProviderExtractionUtil.normalizeText('hello\n\nworld')).toBe('hello world');
    });
  });

  describe('getKeywords', () => {
    it('should split by "/" and normalize each keyword', () => {
      const keywords = ProviderExtractionUtil.getKeywords('AEROPLAN / AIRCANADA');
      expect(keywords).toEqual(['aeroplan', 'aircanada']);
    });

    it('should handle multiple aliases', () => {
      const keywords = ProviderExtractionUtil.getKeywords('AMERICAN AIRLINES / AA / AADVANTAGE');
      expect(keywords).toEqual(['american airlines', 'aa', 'aadvantage']);
    });

    it('should handle single name without slash', () => {
      const keywords = ProviderExtractionUtil.getKeywords('SMILES');
      expect(keywords).toEqual(['smiles']);
    });

    it('should filter out empty keywords', () => {
      const keywords = ProviderExtractionUtil.getKeywords('AZUL//TUDO AZUL');
      expect(keywords).toEqual(['azul', 'tudo azul']);
    });
  });

  describe('getSortedProgramsBySpecificity', () => {
    it('should sort programs by longest keyword first', () => {
      const programs: ProgramOption[] = [
        { id: 1, name: 'AZUL' },
        { id: 2, name: 'AZUL INTERLINE' },
        { id: 3, name: 'AA' },
      ];

      const sorted = ProviderExtractionUtil.getSortedProgramsBySpecificity(programs);

      expect(sorted[0].name).toBe('AZUL INTERLINE'); // 14 chars
      expect(sorted[1].name).toBe('AZUL'); // 4 chars
      expect(sorted[2].name).toBe('AA'); // 2 chars
    });

    it('should not mutate the original array', () => {
      const programs: ProgramOption[] = [
        { id: 1, name: 'AZUL' },
        { id: 2, name: 'AZUL INTERLINE' },
      ];

      const originalFirst = programs[0];
      ProviderExtractionUtil.getSortedProgramsBySpecificity(programs);

      expect(programs[0]).toBe(originalFirst);
    });

    it('should use the longest keyword from aliases', () => {
      const programs: ProgramOption[] = [
        { id: 1, name: 'AA' },
        { id: 2, name: 'A/AMERICAN AIRLINES' }, // "american airlines" is longest
      ];

      const sorted = ProviderExtractionUtil.getSortedProgramsBySpecificity(programs);

      expect(sorted[0].id).toBe(2);
    });
  });

  describe('extractProvider', () => {
    describe('basic matching', () => {
      it('should return null when no programs provided', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo smiles')).toBeNull();
      });

      it('should return null when programs array is empty', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo smiles', [])).toBeNull();
      });

      it('should return null when no match found', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo milhas', samplePrograms)).toBeNull();
      });

      it('should match basic keyword', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo smiles', samplePrograms)).toBe(1);
      });

      it('should match case-insensitively', () => {
        expect(ProviderExtractionUtil.extractProvider('VENDO SMILES', samplePrograms)).toBe(1);
        expect(ProviderExtractionUtil.extractProvider('Vendo Smiles', samplePrograms)).toBe(1);
      });
    });

    describe('multi-alias matching', () => {
      it('should match by any alias', () => {
        expect(ProviderExtractionUtil.extractProvider('tenho aa', samplePrograms)).toBe(13);
        expect(ProviderExtractionUtil.extractProvider('tenho aadvantage', samplePrograms)).toBe(13);
        expect(ProviderExtractionUtil.extractProvider('tenho american airlines', samplePrograms)).toBe(13);
      });

      it('should match AZUL/TUDO AZUL program', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo tudo azul', samplePrograms)).toBe(20);
      });

      it('should match AEROPLAN by either alias', () => {
        expect(ProviderExtractionUtil.extractProvider('aeroplan miles', samplePrograms)).toBe(3);
        expect(ProviderExtractionUtil.extractProvider('aircanada points', samplePrograms)).toBe(3);
      });
    });

    describe('specificity prioritization', () => {
      it('should match AZUL INTERLINE over AZUL when text contains "azul interline"', () => {
        expect(ProviderExtractionUtil.extractProvider('tenho azul interline', samplePrograms)).toBe(18);
      });

      it('should match AZUL PELO MUNDO over AZUL', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo azul pelo mundo', samplePrograms)).toBe(18);
      });

      it('should match plain AZUL when only "azul" is mentioned', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo azul', samplePrograms)).toBe(20);
      });
    });

    describe('LIMINAR special cases', () => {
      it('should return LIMINAR program when "liminar" is in text', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo smiles liminar', samplePrograms)).toBe(21);
        expect(ProviderExtractionUtil.extractProvider('tenho latam liminar', samplePrograms)).toBe(22);
        expect(ProviderExtractionUtil.extractProvider('azul liminar', samplePrograms)).toBe(23);
      });

      it('should skip LIMINAR programs when "liminar" is NOT in text', () => {
        expect(ProviderExtractionUtil.extractProvider('vendo smiles', samplePrograms)).toBe(1);
        expect(ProviderExtractionUtil.extractProvider('vendo latam', samplePrograms)).toBe(19);
      });

      it('should skip non-LIMINAR programs when "liminar" IS in text', () => {
        // Should NOT match regular AZUL (id: 20) when "liminar" is present
        const result = ProviderExtractionUtil.extractProvider('vendo azul liminar', samplePrograms);
        expect(result).toBe(23); // AZUL LIMINAR
      });

      it('should return null if liminar is in text but no matching LIMINAR program', () => {
        const programsWithoutLiminar: ProgramOption[] = [
          { id: 1, name: 'SMILES' },
          { id: 2, name: 'LATAM' },
        ];
        expect(ProviderExtractionUtil.extractProvider('vendo smiles liminar', programsWithoutLiminar)).toBeNull();
      });
    });

    describe('real-world message patterns', () => {
      it('should match from purchase proposal message', () => {
        const message = 'Vendo 100k smiles, aceito R$ 20 o milheiro';
        expect(ProviderExtractionUtil.extractProvider(message, samplePrograms)).toBe(1);
      });

      it('should match with accented text', () => {
        const message = 'Tenho milhas LATAM para vender, ótimos preços';
        expect(ProviderExtractionUtil.extractProvider(message, samplePrograms)).toBe(19);
      });

      it('should match partial text with keyword embedded', () => {
        const message = 'Oferta especial: 50mil smiles por apenas R$1000';
        expect(ProviderExtractionUtil.extractProvider(message, samplePrograms)).toBe(1);
      });

      it('should handle message with multiple keywords - returns first (most specific)', () => {
        const message = 'Tenho smiles e latam para vender';
        const result = ProviderExtractionUtil.extractProvider(message, samplePrograms);
        // Both match, but sorted by specificity - smiles and latam have same length
        // so the first one in sorted order wins
        expect([1, 19]).toContain(result);
      });
    });
  });
});
