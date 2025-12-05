import { createCache, type Cache } from "../utils/cache.js";
import type { PriceTableResult } from "./google-sheets.js";
import { fetchPriceTableFromSheets } from "./google-sheets.js";

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
 * Interface do cache da tabela de preços
 * Re-exporta a interface genérica para manter compatibilidade
 */
export type PriceTableCache = Cache<PriceTableResult>;

/**
 * Cria uma instância do cache da tabela de preços
 * Usa o cache genérico internamente, seguindo o padrão composable
 */
export function createPriceTableCache(
	config: PriceTableCacheConfig,
): PriceTableCache {
	return createCache<PriceTableResult>({
		fetchFn: async () => {
			return await fetchPriceTableFromSheets(
				config.spreadsheetId,
				config.keyFile,
				config.range,
			);
		},
		ttlSeconds: config.ttlSeconds ?? 60,
		debugPrefix: "price-table-cache",
	});
}
