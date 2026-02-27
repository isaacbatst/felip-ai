import { z } from 'zod';

/**
 * Schema para quando a mensagem NÃO é uma proposta de compra
 */
const NonPurchaseProposalSchema = z.object({
  isPurchaseProposal: z.literal(false).describe('Se a mensagem é uma proposta de compra'),
}).describe('Nenhuma proposta de compra foi encontrada na mensagem');

/**
 * Schema para extração de dados brutos via AI (strings, não números).
 * A normalização de quantidade e preço é feita em código após a extração.
 */
const RawProposalSchema = z.object({
  rawQuantity: z
    .string()
    .describe(
      'Quantidade bruta como aparece na mensagem. Exemplos: "242k", "26.1k", "84000", "1kk", "1M", "10", "302,900k"',
    ),
  cpfCount: z.number().int().nonnegative().describe('Numero de CPFs/Passageiros/PAX, contando com bebes (ex: 2 para 2CPF, 4 para 3CPF + 1 bebe/bb/baby). Retorne 0 quando a mensagem diz "sem CPF".'),
  rawPrices: z
    .array(z.string())
    .default([])
    .describe(
      'Lista de valores brutos que o usuario aceita pagar, como aparecem na mensagem. Exemplos: ["15,5"], ["R$ 20"], ["14$"]. Se nao mencionado, retorne array vazio.',
    ),
});

const RawDataExtractionOutputSchema = z.object({
  isPurchaseProposal: z.literal(true).describe('Se a mensagem e uma proposta de compra'),
  proposals: z.array(RawProposalSchema).min(1).describe('Lista de propostas de compra na mensagem'),
}).describe('Dados extraidos da mensagem, contendo uma ou mais propostas de compra');

export const RawDataExtractionRequestSchema = z.object({
  output: z.discriminatedUnion('isPurchaseProposal', [
    RawDataExtractionOutputSchema,
    NonPurchaseProposalSchema,
  ]),
});

export type RawDataExtractionRequest = z.infer<typeof RawDataExtractionRequestSchema>;
export type RawDataExtractionOutput = z.infer<typeof RawDataExtractionOutputSchema>;
export type RawProposal = z.infer<typeof RawProposalSchema>;

/**
 * Proposta de compra normalizada (quantidade em milhas absolutas, preços numéricos).
 */
export interface PurchaseProposal {
  isPurchaseProposal: true;
  /** Quantidade absoluta de milhas. Ex: 84000 para "84k", 242000 para "242k" */
  quantity: number;
  cpfCount: number;
  airlineId: number;
  acceptedPrices: number[];
}

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
