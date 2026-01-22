import { z } from 'zod';

/**
 * Schema Zod para validação da proposta de compra
 */
export const PurchaseRequestSchema = z.object({
  isPurchaseProposal: z.boolean().describe('Se a mensagem é uma proposta de compra'),
  quantity: z.number().positive().nullable().describe('Quantidade em milhares (número decimal). Exemplos: 84 para "84k" ou "84000", 26.1 para "26.100" ou "26.1k", 69.4 para "69,4k" ou "69400"'),
  cpfCount: z.number().int().positive().nullable().describe('Número de CPFs (ex: 2 para 2CPF)'),
  airline: z
    .string()
    .nullable()
    .describe(
      'Nome da companhia aérea ou programa de milhas mencionado (ex: LATAM, SMILES, TUDO AZUL)',
    ),
  acceptedPrices: z
    .array(z.number().positive())
    .default([])
    .describe(
      'Lista de valores que o usuário aceita pagar. Se não mencionado na mensagem, retorne array vazio.',
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
  acceptedPrices: number[];
}

/**
 * Resultado do cálculo de preço
 */
export type PriceCalculationResult =
  | { success: true; price: number }
  | { success: false; reason: string };

