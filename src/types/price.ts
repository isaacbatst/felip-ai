/**
 * Tabela de preços: [quantidade em milhares, preço]
 */
export type PriceTable = Record<number, number>;

/**
 * Tabela de preços por número de CPF
 */
export type PriceTableByCpf = Record<number, PriceTable>;

