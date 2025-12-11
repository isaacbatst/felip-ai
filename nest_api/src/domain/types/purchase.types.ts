import { z } from 'zod';

/**
 * Schema Zod para validação da proposta de compra
 */
export const PurchaseRequestSchema = z.object({
  isPurchaseProposal: z.boolean().describe('Se a mensagem é uma proposta de compra'),
  quantity: z.number().positive().nullable().describe('Quantidade em milhares (ex: 27 para 27k)'),
  cpfCount: z.number().int().positive().nullable().describe('Número de CPFs (ex: 2 para 2CPF)'),
  airline: z
    .string()
    .nullable()
    .describe(
      'Nome da companhia aérea ou programa de milhas mencionado (ex: LATAM, SMILES, TUDO AZUL)',
    ),
});

export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;

/**
 * Dados validados de uma proposta de compra
 */
export interface ValidatedPurchaseRequest {
  quantity: number;
  cpfCount: number;
  airline: string | undefined;
  milesProgram: string | null;
}

/**
 * Resultado do cálculo de preço
 */
export type PriceCalculationResult =
  | { success: true; price: number }
  | { success: false; reason: string };
