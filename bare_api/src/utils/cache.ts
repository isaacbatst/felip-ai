/**
 * Cache entry com timestamp
 */
interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

/**
 * Configuração para o cache genérico
 */
export interface CacheConfig<T> {
	fetchFn: () => Promise<T>;
	ttlSeconds?: number; // Default: 60
	debugPrefix?: string; // Prefixo para logs de debug
}

/**
 * Interface do cache genérico
 * Segue o padrão funcional e composable do projeto
 */
export interface Cache<T> {
	get: (forceRefresh?: boolean) => Promise<T>;
	clear: () => void;
	getCached: () => T | null;
}

/**
 * Verifica se o cache está válido baseado no timestamp e TTL
 * Função pura utilitária
 */
const isCacheValid = <T>(
	cache: CacheEntry<T> | null,
	ttlMs: number,
): boolean => {
	if (!cache) {
		return false;
	}
	const age = Date.now() - cache.timestamp;
	return age < ttlMs;
};

/**
 * Cria uma instância de cache genérico
 * Função factory que retorna um objeto com métodos, seguindo o padrão composable
 * 
 * @example
 * ```ts
 * const cache = createCache({
 *   fetchFn: async () => await fetchData(),
 *   ttlSeconds: 60,
 *   debugPrefix: "my-cache"
 * });
 * 
 * const data = await cache.get(); // Busca e cacheia
 * const cached = cache.getCached(); // Retorna null se expirado
 * cache.clear(); // Limpa o cache
 * ```
 */
export function createCache<T>(
	config: CacheConfig<T>,
): Cache<T> {
	// Estado do cache encapsulado no closure
	let cache: CacheEntry<T> | null = null;
	const ttlMs = (config.ttlSeconds ?? 60) * 1000;
	const debugPrefix = config.debugPrefix ?? "cache";

	/**
	 * Obtém os dados do cache, revalidando se necessário
	 * Se o cache estiver expirado ou não existir, executa a função de fetch
	 */
	const get = async (forceRefresh: boolean = false): Promise<T> => {
		if (forceRefresh || !isCacheValid(cache, ttlMs)) {
			console.log(`[DEBUG] ${debugPrefix}: Cache miss or expired, fetching data`, {
				forceRefresh,
				hasCache: !!cache,
				cacheAge: cache ? Date.now() - cache.timestamp : null,
			});

			const data = await config.fetchFn();

			cache = {
				data,
				timestamp: Date.now(),
			};

			console.log(`[DEBUG] ${debugPrefix}: Cache updated`, {
				timestamp: cache.timestamp,
			});

			return data;
		}

		if (!cache) {
			throw new Error("Cache is null but was validated");
		}

		console.log(`[DEBUG] ${debugPrefix}: Using cached data`, {
			cacheAge: Date.now() - cache.timestamp,
		});

		return cache.data;
	};

	/**
	 * Limpa o cache
	 */
	const clear = (): void => {
		console.log(`[DEBUG] ${debugPrefix}: Cache cleared`);
		cache = null;
	};

	/**
	 * Obtém os dados do cache sem revalidar (retorna null se expirado ou não existir)
	 */
	const getCached = (): T | null => {
		if (!isCacheValid(cache, ttlMs)) {
			return null;
		}
		return cache ? cache.data : null;
	};

	return {
		get,
		clear,
		getCached,
	};
}

