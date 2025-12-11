import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';
import {
  BRAZILIAN_MILES_PROGRAMS,
  type MilesProgram,
} from '../../domain/types/miles-program.types';
import type { PriceTableV2 } from '../../domain/types/price.types';

/**
 * Service responsável por buscar dados do Google Sheets
 * Single Responsibility: apenas comunicação com Google Sheets API
 */
@Injectable()
export class GoogleSheetsService {
  /**
   * Busca a tabela de preços v2 do Google Sheets
   */
  private async fetchPriceTable(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    range: string,
    sheetName: string,
  ): Promise<PriceTableV2> {
    const fullRange = `${sheetName}${range}`;

    let response: unknown;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      });
    } catch (error: unknown) {
      if ((error as { code?: number })?.code === 400 && range.includes('!A:B')) {
        const fallbackRange = sheetName;
        response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: fallbackRange,
        });
      } else {
        throw error;
      }
    }

    if (
      !response ||
      typeof response !== 'object' ||
      !('data' in response) ||
      !response.data ||
      typeof response.data !== 'object' ||
      !('values' in response.data) ||
      !response.data.values ||
      !Array.isArray(response.data.values) ||
      response.data.values.length === 0
    ) {
      throw new Error('Resposta da API do Google Sheets inválida');
    }

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      throw new Error('Planilha v2 vazia ou não encontrada');
    }

    const priceTable: PriceTableV2 = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) {
        continue;
      }

      const quantity = parseInt(row[0]?.toString().trim() || '', 10);
      const price = parseFloat(row[1]?.toString().trim().replace(',', '.') || '');

      if (Number.isNaN(quantity) || Number.isNaN(price)) {
        continue;
      }

      priceTable[quantity] = price;
    }

    return priceTable;
  }

  /**
   * Busca o preço máximo customizado da célula C2
   */
  private async fetchCustomMaxPrice(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<number | undefined> {
    try {
      const cellRange = `${sheetName}!C2`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: cellRange,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0 || !rows[0] || rows[0].length === 0) {
        return undefined;
      }

      const cellValue = rows[0][0]?.toString().trim();
      if (!cellValue) {
        return undefined;
      }

      const parsedValue = parseFloat(cellValue.replace(',', '.'));
      if (Number.isNaN(parsedValue) || parsedValue <= 0) {
        return undefined;
      }

      return parsedValue;
    } catch (_error) {
      return undefined;
    }
  }

  /**
   * Busca milhas disponíveis para todos os programas em uma única requisição
   */
  private async fetchAllAvailableMiles(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<Record<MilesProgram, number | null>> {
    const availableMiles: Record<MilesProgram, number | null> = {} as Record<
      MilesProgram,
      number | null
    >;

    for (const program of BRAZILIAN_MILES_PROGRAMS) {
      availableMiles[program] = null;
    }

    try {
      const programsRange = `${sheetName}!D:E`;
      const programsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: programsRange,
      });

      const rows = programsResponse.data.values;
      if (rows && rows.length > 0) {
        for (const row of rows) {
          if (!row || row.length < 2) {
            continue;
          }
          const programName = row[0]?.toString().trim().toUpperCase();
          const milesValue = row[1]?.toString().trim();
          if (!programName || !milesValue) {
            continue;
          }

          for (const program of BRAZILIAN_MILES_PROGRAMS) {
            if (programName === program) {
              const parsedValue = parseFloat(milesValue.replace(',', '.'));
              if (!Number.isNaN(parsedValue) && parsedValue >= 0) {
                availableMiles[program] = parsedValue;
                break;
              }
            }
          }
        }
      }
    } catch (_error) {
      // Ignore errors
    }

    return availableMiles;
  }

  /**
   * Busca a tabela de preços v2 do Google Sheets e a quantidade de milhas disponíveis
   */
  async fetchPriceTableV2FromSheets(
    spreadsheetId: string,
    keyFile: string,
  ): Promise<PriceTableResultV2> {
    const auth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const range = '!A:B';
    const sheetName = 'Sheet1';

    const [priceTable, availableMiles, customMaxPrice] = await Promise.all([
      this.fetchPriceTable(sheets, spreadsheetId, range, sheetName),
      this.fetchAllAvailableMiles(sheets, spreadsheetId, sheetName),
      this.fetchCustomMaxPrice(sheets, spreadsheetId, sheetName),
    ]);

    return {
      priceTable,
      availableMiles,
      customMaxPrice,
    };
  }
}
