import type { PriceTableProvider } from "../handlers/message-handler.js";
import type { PriceTableResult } from "../services/google-sheets.js";
import type { PriceTableCache } from "../services/price-table-cache.js";

/**
 * Adapter that implements PriceTableProvider interface using PriceTableCache
 * Follows Adapter pattern to bridge between interface and implementation
 * Only exposes what the handler needs (ISP - Interface Segregation Principle)
 */
export class PriceTableProviderAdapter implements PriceTableProvider {
	constructor(private readonly priceTableCache: PriceTableCache) {}

	async getPriceTable(): Promise<PriceTableResult> {
		// Always force refresh to ensure fresh data
		return await this.priceTableCache.get(true);
	}
}

