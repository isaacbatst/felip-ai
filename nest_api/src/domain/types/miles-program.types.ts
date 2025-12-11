/**
 * Programas de milhas aéreas existentes no Brasil
 */
export const BRAZILIAN_MILES_PROGRAMS = [
  'LATAM_PASS',
  'SMILES',
  'TUDO_AZUL',
  'LIVELO',
  'ESFERA',
  'INTER_LOOP',
  'ITAU_SEMPRE_PRESENTE',
  'CAIXA_ELO',
  'CAIXA_MAIS',
] as const;

export type MilesProgram = (typeof BRAZILIAN_MILES_PROGRAMS)[number];
