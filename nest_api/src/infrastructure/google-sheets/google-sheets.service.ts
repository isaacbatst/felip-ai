import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import type { PriceTableResultV2 } from '../../domain/types/google-sheets.types';
import {
  BRAZILIAN_MILES_PROGRAMS,
  type MilesProgram,
} from '../../domain/types/miles-program.types';
import type { Provider } from '../../domain/types/provider.types';
import type { PriceTableV2 } from '../../domain/types/price.types';

/**
 * Service responsável por buscar dados do Google Sheets
 * Single Responsibility: apenas comunicação com Google Sheets API
 */
@Injectable()
export class GoogleSheetsService {
  /**
   * Normaliza nome de provedor para comparação (remove espaços extras, converte para maiúsculas)
   * Mas retorna o nome original da planilha como Provider
   */
  private normalizeProviderName(providerName: string): string {
    return providerName.trim().toUpperCase();
  }

  /**
   * Verifica se uma string é um nome de provedor válido
   * Retorna o nome original se for válido, null caso contrário
   */
  private isValidProviderName(providerName: string): Provider | null {
    const normalized = this.normalizeProviderName(providerName);
    
    // Ignora células vazias ou cabeçalhos
    if (
      !normalized ||
      normalized === '' ||
      normalized.includes('PROGRAMAS') ||
      normalized.includes('QUANTIDADE') ||
      normalized.includes('VALOR') ||
      normalized.includes('PREÇO TETO') ||
      normalized.includes('MAXIMO ESTOQUE') ||
      normalized.includes('ESTOQUE/CONTA')
    ) {
      return null;
    }

    // Retorna o nome original (não normalizado) como Provider
    return providerName.trim();
  }

  /**
   * Busca todas as tabelas de preços v2 por provedor do Google Sheets
   * Novo formato: lê valores por CPF de múltiplas colunas, uma para cada provedor
   * Detecta providers dinamicamente da planilha
   */
  private async fetchPriceTables(
    sheets: ReturnType<typeof google.sheets>,
    spreadsheetId: string,
    sheetName: string,
  ): Promise<Record<Provider, PriceTableV2>> {
    // Lê toda a planilha para processar o novo formato
    const fullRange = sheetName;

    let response: unknown;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      });
    } catch (error: unknown) {
      throw error;
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

    // Tabelas de preços dinâmicas - detectadas da planilha
    const priceTables: Record<Provider, PriceTableV2> = {};
    const providerColumns: Array<{ provider: Provider; quantityCol: number; valueCol: number }> = [];

    // Procura pela linha que contém os nomes dos provedores
    // E pela linha seguinte que contém os cabeçalhos QUANTIDADE/CPF e VALOR
    for (let i = 0; i < rows.length - 1; i++) {
      const row = rows[i];
      const nextRow = rows[i + 1];
      
      if (!row || !Array.isArray(row) || !nextRow || !Array.isArray(nextRow)) {
        continue;
      }

      // Procura por pares QUANTIDADE/CPF e VALOR na linha seguinte
      for (let j = 0; j < nextRow.length - 1; j++) {
        const headerCell1 = nextRow[j]?.toString().toUpperCase().trim() || '';
        const headerCell2 = nextRow[j + 1]?.toString().toUpperCase().trim() || '';
        
        if (headerCell1.includes('QUANTIDADE/CPF') && headerCell2.includes('VALOR')) {
          // Tenta identificar o provedor olhando a célula correspondente na linha anterior
          // Também verifica células adjacentes caso o nome esteja em coluna diferente
          let provider: Provider | null = null;
          
          // Primeiro tenta a célula exata na mesma coluna
          const providerCell = row[j]?.toString().trim() || '';
          provider = this.isValidProviderName(providerCell);
          
          // Se não encontrou, tenta células adjacentes (pode estar em coluna diferente)
          if (!provider && j > 0) {
            const prevCell = row[j - 1]?.toString().trim() || '';
            provider = this.isValidProviderName(prevCell);
          }
          
          // Se ainda não encontrou, procura em toda a linha anterior por um provider válido
          if (!provider) {
            for (let k = Math.max(0, j - 5); k < Math.min(row.length, j + 5); k++) {
              const cell = row[k]?.toString().trim() || '';
              const candidate = this.isValidProviderName(cell);
              if (candidate) {
                provider = candidate;
                break;
              }
            }
          }
          
          if (provider) {
            // Inicializa a tabela se ainda não existir
            if (!priceTables[provider]) {
              priceTables[provider] = {};
            }
            
            // Evita duplicatas verificando se já existe esta coluna para este provider
            const exists = providerColumns.some(
              (pc) => pc.provider === provider && pc.quantityCol === j,
            );
            
            if (!exists) {
              providerColumns.push({
                provider,
                quantityCol: j,
                valueCol: j + 1,
              });
            }
          }
        }
      }
    }

    // Lê os valores para cada provedor
    // Para cada provedor, encontra a linha de início dos dados (após PREÇO TETO ou diretamente após cabeçalho)
    for (const { provider, quantityCol, valueCol } of providerColumns) {
      const priceTable: PriceTableV2 = {};

      // Encontra a linha de início dos dados para este provedor
      // Procura pela linha de cabeçalho QUANTIDADE/CPF correspondente
      let dataStartRow = 0;
      for (let i = 0; i < rows.length - 1; i++) {
        const row = rows[i];
        const nextRow = rows[i + 1];
        if (
          row &&
          Array.isArray(row) &&
          nextRow &&
          Array.isArray(nextRow) &&
          nextRow[quantityCol]?.toString().toUpperCase().trim().includes('QUANTIDADE/CPF')
        ) {
          // A linha de dados começa 2 linhas depois do cabeçalho (pula PREÇO TETO se existir)
          dataStartRow = i + 2;
          break;
        }
      }

      for (let i = dataStartRow; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length <= Math.max(quantityCol, valueCol)) {
          continue;
        }

        const quantityStr = row[quantityCol]?.toString().trim() || '';
        const valueStr = row[valueCol]?.toString().trim() || '';

        // Para se encontrar uma linha completamente vazia
        if (!quantityStr && !valueStr) {
          // Verifica se as próximas linhas também estão vazias
          let allEmpty = true;
          for (let j = i + 1; j < Math.min(i + 3, rows.length); j++) {
            const nextRow = rows[j];
            if (nextRow && nextRow.length > 0 && nextRow.some((cell) => cell?.toString().trim())) {
              allEmpty = false;
              break;
            }
          }
          if (allEmpty) {
            break;
          }
          continue;
        }

        // Ignora linhas que começam com "PREÇO TETO" ou nomes de programas
        const firstCell = row[0]?.toString().toUpperCase().trim() || '';
        if (
          firstCell.includes('PREÇO TETO') ||
          firstCell.includes('PROGRAMAS') ||
          (firstCell.length > 0 && !quantityStr.match(/^\d+[kK]?$/i))
        ) {
          if (!quantityStr.match(/^\d+[kK]?$/i)) {
            continue;
          }
        }

        if (!quantityStr || !valueStr) {
          continue;
        }

        // Remove "k" ou "K" e converte para número (ex: "15k" -> 15)
        const quantityMatch = quantityStr.match(/^(\d+)[kK]?$/i);
        if (!quantityMatch) {
          continue;
        }

        const quantity = parseInt(quantityMatch[1], 10);
        
        // Remove aspas e converte vírgula para ponto
        const cleanValue = valueStr.replace(/["']/g, '').replace(',', '.');
        const price = parseFloat(cleanValue);

        if (Number.isNaN(quantity) || Number.isNaN(price) || quantity <= 0 || price <= 0) {
          continue;
        }

        priceTable[quantity] = price;
      }

      // Mescla com a tabela existente (pode haver múltiplas seções)
      if (Object.keys(priceTable).length > 0) {
        priceTables[provider] = { ...priceTables[provider], ...priceTable };
      }
    }

    return priceTables;
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
   * Mapeia nomes de programas da planilha para os tipos MilesProgram
   */
  private mapProgramNameToMilesProgram(programName: string): MilesProgram | null {
    const normalized = programName.toUpperCase().trim();
    
    const mapping: Record<string, MilesProgram> = {
      'SMILES': 'SMILES',
      'LATAM': 'LATAM_PASS',
      'LATAM_PASS': 'LATAM_PASS',
      'AZUL': 'TUDO_AZUL',
      'TUDO_AZUL': 'TUDO_AZUL',
      'AZUL/TUDO AZUL': 'TUDO_AZUL',
      'LIVELO': 'LIVELO',
      'ESFERA': 'ESFERA',
      'INTER_LOOP': 'INTER_LOOP',
      'ITAU_SEMPRE_PRESENTE': 'ITAU_SEMPRE_PRESENTE',
      'CAIXA_ELO': 'CAIXA_ELO',
      'CAIXA_MAIS': 'CAIXA_MAIS',
    };

    return mapping[normalized] || null;
  }

  /**
   * Busca milhas disponíveis para todos os programas em uma única requisição
   * Novo formato: lê da coluna A (programa) e coluna B (máximo estoque)
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
      // Lê toda a planilha para processar o novo formato
      const fullRange = sheetName;
      const programsResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: fullRange,
      });

      const rows = programsResponse.data.values;
      if (rows && rows.length > 0) {
        // Pula a primeira linha (cabeçalho)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) {
            continue;
          }

          const programName = row[0]?.toString().trim() || '';
          const milesValue = row[1]?.toString().trim() || '';

          if (!programName || !milesValue) {
            continue;
          }

          // Ignora linhas que são cabeçalhos ou separadores
          if (
            programName.toUpperCase().includes('PROGRAMAS') ||
            programName.toUpperCase().includes('QUANTIDADE') ||
            programName.toUpperCase().includes('VALOR') ||
            programName.toUpperCase().includes('PREÇO TETO') ||
            programName === ''
          ) {
            continue;
          }

          // Ignora valores inválidos como "teste de valor invalido"
          if (milesValue.toLowerCase().includes('teste') || milesValue.toLowerCase().includes('inválido')) {
            continue;
          }

          const mappedProgram = this.mapProgramNameToMilesProgram(programName);
          if (!mappedProgram) {
            continue;
          }

          // Remove pontos de milhar e converte vírgula para ponto
          const cleanValue = milesValue.replace(/\./g, '').replace(',', '.');
          const parsedValue = parseFloat(cleanValue);

          if (!Number.isNaN(parsedValue) && parsedValue >= 0) {
            // Se já existe um valor, mantém o maior
            if (availableMiles[mappedProgram] === null || parsedValue > (availableMiles[mappedProgram] || 0)) {
              availableMiles[mappedProgram] = parsedValue;
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
    const sheetName = 'PROGRAMAS/ESTOQUE';

    const [priceTables, availableMiles, customMaxPrice] = await Promise.all([
      this.fetchPriceTables(sheets, spreadsheetId, sheetName),
      this.fetchAllAvailableMiles(sheets, spreadsheetId, sheetName),
      this.fetchCustomMaxPrice(sheets, spreadsheetId, sheetName),
    ]);

    return {
      priceTables,
      availableMiles,
      customMaxPrice,
    };
  }
}

