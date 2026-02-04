import { z } from 'zod';

/**
 * Schema para quando a mensagem É uma proposta de compra
 */
const PurchaseProposalSchema = z.object({
  isPurchaseProposal: z.literal(true).describe('Se a mensagem é uma proposta de compra'),
  quantity: z
    .number()
    .positive()
    .describe(
      'Quantidade em milhares (número decimal). Exemplos: 84 para "84k" ou "84000", 26.1 para "26.100" ou "26.1k", 69.4 para "69,4k" ou "69400"',
    ),
  cpfCount: z.number().int().positive().describe('Número de CPFs (ex: 2 para 2CPF)'),
  airlineId: z
    .number()
    .int()
    .positive()
    .describe('ID do programa de milhas selecionado da lista de programas disponíveis'),
  acceptedPrices: z
    .array(z.number().positive())
    .default([])
    .describe(
      'Lista de valores que o usuário aceita pagar. Se não mencionado na mensagem, retorne array vazio.',
    ),
});

/**
 * Schema para quando a mensagem NÃO é uma proposta de compra
 */
const NonPurchaseProposalSchema = z.object({
  isPurchaseProposal: z.literal(false).describe('Se a mensagem é uma proposta de compra'),
});

/**
 * Schema Zod para validação da proposta de compra usando discriminated union
 */
export const PurchaseRequestOutputSchema = z.discriminatedUnion('isPurchaseProposal', [
  PurchaseProposalSchema,
  NonPurchaseProposalSchema,
]);

export const PurchaseRequestSchema = z.object({
  output: PurchaseRequestOutputSchema,
});

/**
 * Schema para extração de dados via AI (sem airlineId - provider é extraído por keyword)
 */
const DataExtractionOutputSchema = z.object({
  isPurchaseProposal: z.literal(true).describe('Se a mensagem é uma proposta de compra'),
  quantity: z
    .number()
    .positive()
    .describe(
      'Quantidade. 84k => 84000, 26.1k => 26100, 34.500k => 34500, 25kk => 25000000',
    ),
  cpfCount: z.number().int().positive().describe('Número de CPFs, contando com bebês (ex: 2 para 2CPF, 4 para 3CPF + 1 bebê)'),
  acceptedPrices: z
    .array(z.number().positive())
    .default([])
    .describe(
      'Lista de valores que o usuário aceita pagar. Se não mencionado na mensagem, retorne array vazio.',
    ),
});

/**
 * Schema para resposta da extração de dados via AI
 */
export const DataExtractionRequestSchema = z.object({
  output: z.discriminatedUnion('isPurchaseProposal', [
    DataExtractionOutputSchema,
    NonPurchaseProposalSchema,
  ]),
});

export type DataExtractionRequest = z.infer<typeof DataExtractionRequestSchema>;
export type DataExtractionOutput = z.infer<typeof DataExtractionOutputSchema>;

export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;
export type PurchaseProposal = z.infer<typeof PurchaseProposalSchema>;
export type NonPurchaseProposal = z.infer<typeof NonPurchaseProposalSchema>;

/**
 * Dados validados de uma proposta de compra
 */
export interface ValidatedPurchaseRequest {
  quantity: number;
  cpfCount: number;
  airlineId: number | undefined;
  acceptedPrices: number[];
}

/**
 * Resultado do cálculo de preço
 */
export type PriceCalculationResult =
  | { success: true; price: number }
  | { success: false; reason: string };
