import type { PriceTableProvider } from "../handlers/message-handler.js";
import type { PriceTableResultV2 } from "../services/google-sheets.js";
import type { PriceTableCacheV2 } from "../services/price-table-cache.js";

/**
 * Adapter that implements PriceTableProvider interface using PriceTableCacheV2
 * Follows Adapter pattern to bridge between interface and implementation
 * Only exposes what the handler needs (ISP - Interface Segregation Principle)
 */
export class PriceTableProviderAdapter implements PriceTableProvider {
	constructor(private readonly priceTableCache: PriceTableCacheV2) {}

	async getPriceTable(): Promise<PriceTableResultV2> {
		// Always force refresh to ensure fresh data
		return await this.priceTableCache.get(true);
	}
}

