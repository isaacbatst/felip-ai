import { Injectable, InjectionToken } from '@nestjs/common';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';

/**
 * Cache entry com timestamp
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Service abstrato responsável por gerenciar cache genérico
 * Single Responsibility: apenas gerenciamento de cache
 * Template Method Pattern: subclasses implementam fetch() para definir como buscar dados
 */
@Injectable()
export abstract class CacheService<T> {
  private cache: CacheEntry<T> | null = null;
  private readonly ttlMs: number;
  private readonly debugPrefix: string;

  constructor(ttlSeconds?: number, debugPrefix?: string) {
    this.ttlMs = (ttlSeconds ?? 60) * 1000;
    this.debugPrefix = debugPrefix ?? 'cache';
  }

  /**
   * Método abstrato que deve ser implementado pelas subclasses para buscar os dados
   */
  protected abstract fetch(): Promise<T>;

  /**
   * Verifica se o cache está válido baseado no timestamp e TTL
   */
  private isCacheValid(cache: CacheEntry<T> | null): boolean {
    if (!cache) {
      return false;
    }
    const age = Date.now() - cache.timestamp;
    return age < this.ttlMs;
  }

  /**
   * Obtém os dados do cache, revalidando se necessário
   */
  async get(forceRefresh: boolean = false): Promise<T> {
    if (forceRefresh || !this.isCacheValid(this.cache)) {
      const data = await this.fetch();

      this.cache = {
        data,
        timestamp: Date.now(),
      };

      return data;
    }

    if (!this.cache) {
      throw new Error('Cache is null but was validated');
    }

    return this.cache.data;
  }

  /**
   * Limpa o cache
   */
  clear(): void {
    this.cache = null;
  }

  /**
   * Obtém os dados do cache sem revalidar (retorna null se expirado ou não existir)
   */
  getCached(): T | null {
    if (!this.isCacheValid(this.cache)) {
      return null;
    }
    return this.cache ? this.cache.data : null;
  }
}

/**
 * Classe abstrata específica para CacheService<PriceTableResultV2>
 * Permite usar a classe abstrata diretamente como token de injeção
 */
@Injectable()
export abstract class AbstractPriceTableCache extends CacheService<PriceTableResultV2> {}
