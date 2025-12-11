/**
 * Tabela de preços: [quantidade em milhares, preço]
 */
export type PriceTable = Record<number, number>;

/**
 * Tabela de preços por número de CPF
 */
export type PriceTableByCpf = Record<number, PriceTable>;

/**
 * Tabela de preços v2: apenas quantidade e preço, todos os registros são para 1 CPF
 */
export type PriceTableV2 = Record<number, number>;
