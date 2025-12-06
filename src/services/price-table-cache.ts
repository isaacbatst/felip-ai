import { type Cache, createCache } from "../utils/cache.js";
import type { PriceTableResultV2 } from "./google-sheets.js";
import { fetchPriceTableV2FromSheets } from "./google-sheets.js";

/**
 * Configuração para o cache da planilha
 */
export interface PriceTableCacheConfig {
	spreadsheetId: string;
	keyFile: string;
	range?: string;
	ttlSeconds?: number; // Default: 60
}

/**
 * Interface do cache da tabela de preços v2
 */
export type PriceTableCacheV2 = Cache<PriceTableResultV2>;

/**
 * Configuração para o cache da planilha v2
 */
export interface PriceTableCacheV2Config {
	spreadsheetId: string;
	keyFile: string;
	range?: string;
	ttlSeconds?: number; // Default: 60
}

/**
 * Cria uma instância do cache da tabela de preços v2
 * Usa o cache genérico internamente, seguindo o padrão composable
 */
export function createPriceTableCacheV2(
	config: PriceTableCacheV2Config,
): PriceTableCacheV2 {
	return createCache<PriceTableResultV2>({
		fetchFn: async () => {
			return await fetchPriceTableV2FromSheets(
				config.spreadsheetId,
				config.keyFile,
			);
		},
		ttlSeconds: config.ttlSeconds ?? 60,
		debugPrefix: "price-table-cache-v2",
	});
}
