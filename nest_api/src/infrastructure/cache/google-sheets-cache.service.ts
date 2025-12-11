import { Injectable } from '@nestjs/common';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';
import type { GoogleSheetsService } from '../google-sheets/google-sheets.service';
import { AbstractPriceTableCache } from './cache.service';

/**
 * Configuração para o cache do Google Sheets
 */
export interface GoogleSheetsCacheConfig {
  spreadsheetId: string;
  keyFile: string;
  ttlSeconds?: number;
  debugPrefix?: string;
}

/**
 * Implementação do CacheService para Google Sheets
 * Strategy Pattern: implementa a estratégia de busca de dados do Google Sheets
 */
@Injectable()
export class GoogleSheetsCacheService extends AbstractPriceTableCache {
  constructor(
    private readonly config: GoogleSheetsCacheConfig,
    private readonly googleSheetsService: GoogleSheetsService,
  ) {
    super(config.ttlSeconds, config.debugPrefix);
  }

  /**
   * Implementação do método abstrato fetch() para buscar dados do Google Sheets
   */
  protected async fetch(): Promise<PriceTableResultV2> {
    return await this.googleSheetsService.fetchPriceTableV2FromSheets(
      this.config.spreadsheetId,
      this.config.keyFile,
    );
  }
}

