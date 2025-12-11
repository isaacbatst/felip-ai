import { Injectable } from '@nestjs/common';
import { BRAZILIAN_MILES_PROGRAMS, type MilesProgram } from '../types/miles-program.types';
import { FuzzyMatchUtil } from '../utils/fuzzy-match.util';

/**
 * Service responsável por normalizar nomes de programas de milhas
 * Single Responsibility: apenas normalização de programas
 */
@Injectable()
export class MilesProgramNormalizerService {
  private readonly PROGRAM_ALIASES: Record<string, MilesProgram> = {
    'latam pass': 'LATAM_PASS',
    latampass: 'LATAM_PASS',
    latam: 'LATAM_PASS',
    'latam fidelidade': 'LATAM_PASS',
    multiplus: 'LATAM_PASS',
    'multi plus': 'LATAM_PASS',
    'multiplus tam': 'LATAM_PASS',
    tam: 'LATAM_PASS',
    smiles: 'SMILES',
    'smiles gol': 'SMILES',
    'smiles gol linhas aéreas': 'SMILES',
    gol: 'SMILES',
    'tudo azul': 'TUDO_AZUL',
    tudoazul: 'TUDO_AZUL',
    azul: 'TUDO_AZUL',
    livelo: 'LIVELO',
    esfera: 'ESFERA',
    'inter loop': 'INTER_LOOP',
    interloop: 'INTER_LOOP',
    inter: 'INTER_LOOP',
    'banco inter': 'INTER_LOOP',
    'itau sempre presente': 'ITAU_SEMPRE_PRESENTE',
    'itaú sempre presente': 'ITAU_SEMPRE_PRESENTE',
    itausemprepresente: 'ITAU_SEMPRE_PRESENTE',
    itau: 'ITAU_SEMPRE_PRESENTE',
    'itau pontos': 'ITAU_SEMPRE_PRESENTE',
    'caixa elo': 'CAIXA_ELO',
    caixaelo: 'CAIXA_ELO',
    elo: 'CAIXA_ELO',
    'caixa mais': 'CAIXA_MAIS',
    caixamais: 'CAIXA_MAIS',
    'caixa+': 'CAIXA_MAIS',
  };

  /**
   * Normaliza o nome de um programa de milhas para o formato padronizado
   */
  normalize(programName: string | null | undefined): MilesProgram | null {
    if (!programName) {
      return null;
    }

    const normalized = programName.trim().toLowerCase().replace(/\s+/g, ' ');

    // 1. Busca exata
    const aliasMatch = this.PROGRAM_ALIASES[normalized];
    if (aliasMatch) {
      return aliasMatch;
    }

    // 2. Busca parcial
    for (const [alias, program] of Object.entries(this.PROGRAM_ALIASES)) {
      const aliasNormalized = alias.replace(/\s+/g, '');
      const inputNormalized = normalized.replace(/\s+/g, '');

      if (
        normalized.includes(alias) ||
        alias.includes(normalized) ||
        inputNormalized.includes(aliasNormalized) ||
        aliasNormalized.includes(inputNormalized)
      ) {
        return program;
      }
    }

    // 3. Fuzzy matching nos aliases
    const fuzzyNormalized = FuzzyMatchUtil.normalizeForFuzzy(normalized);
    const aliases = Object.keys(this.PROGRAM_ALIASES);

    const fuzzyMatch = FuzzyMatchUtil.findBestFuzzyMatch(fuzzyNormalized, aliases, 0.7);
    if (fuzzyMatch) {
      const matchedProgram = this.PROGRAM_ALIASES[fuzzyMatch.match];
      if (matchedProgram) {
        return matchedProgram;
      }
    }

    // 4. Fuzzy matching direto nos nomes dos programas
    const programNames = BRAZILIAN_MILES_PROGRAMS.map((p) => p.toLowerCase().replace(/_/g, ' '));
    const programFuzzyMatch = FuzzyMatchUtil.findBestFuzzyMatch(fuzzyNormalized, programNames, 0.7);
    if (programFuzzyMatch) {
      const matchedProgram = BRAZILIAN_MILES_PROGRAMS.find(
        (p) => p.toLowerCase().replace(/_/g, ' ') === programFuzzyMatch.match,
      );
      return matchedProgram ?? null;
    }

    return null;
  }

  /**
   * Verifica se um programa de milhas é válido
   */
  isValid(program: string | null | undefined): program is MilesProgram {
    if (!program) {
      return false;
    }
    return BRAZILIAN_MILES_PROGRAMS.includes(program as MilesProgram);
  }
}

