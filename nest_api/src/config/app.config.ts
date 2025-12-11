import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsável por validar e fornecer configuração da aplicação
 * Single Responsibility: apenas gerenciamento de configuração
 * Composition: usa ConfigService do NestJS para acessar variáveis de ambiente
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {
    // Validar configurações obrigatórias na inicialização
    this.validateRequiredConfig();
  }

  private validateRequiredConfig(): void {
    const requiredVars = [
      'TELEGRAM_BOT_TOKEN',
      'GOOGLE_SPREADSHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_KEY_FILE',
      'TELEGRAM_API_ID',
      'TELEGRAM_API_HASH',
      'TELEGRAM_DATABASE_DIRECTORY',
      'TELEGRAM_FILES_DIRECTORY',
    ];

    for (const varName of requiredVars) {
      const value = this.configService.get<string>(varName);
      if (!value) {
        throw new Error(`${varName} is not set`);
      }
    }
  }

  getTelegramBotToken(): string {
    const value = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!value) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    return value;
  }

  getGoogleSpreadsheetId(): string {
    const value = this.configService.get<string>('GOOGLE_SPREADSHEET_ID');
    if (!value) {
      throw new Error('GOOGLE_SPREADSHEET_ID is not set');
    }
    return value;
  }

  getGoogleServiceAccountKeyFile(): string {
    const value = this.configService.get<string>('GOOGLE_SERVICE_ACCOUNT_KEY_FILE');
    if (!value) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_FILE is not set');
    }
    return value;
  }

  getTelegramApiId(): string {
    const value = this.configService.get<string>('TELEGRAM_API_ID');
    if (!value) {
      throw new Error('TELEGRAM_API_ID is not set');
    }
    return value;
  }

  getTelegramApiHash(): string {
    const value = this.configService.get<string>('TELEGRAM_API_HASH');
    if (!value) {
      throw new Error('TELEGRAM_API_HASH is not set');
    }
    return value;
  }

  getTelegramPhone(): string {
    return this.configService.get<string>('TELEGRAM_PHONE', '+5584987287398');
  }

  getGoogleSpreadsheetRangeV2(): string | undefined {
    return this.configService.get<string>('GOOGLE_SPREADSHEET_RANGE_V2');
  }

  getPriceTableCacheTtlSeconds(): number {
    const value = this.configService.get<string>('PRICE_TABLE_CACHE_TTL_SECONDS', '10');
    return Number.parseInt(value, 10);
  }

  getOpenAIApiKey(): string {
    const value = this.configService.get<string>('OPENAI_API_KEY');
    if (!value) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return value;
  }

  getTelegramDatabaseDirectory(): string {
    const value = this.configService.get<string>('TELEGRAM_DATABASE_DIRECTORY');
    if (!value) {
      throw new Error('TELEGRAM_DATABASE_DIRECTORY is not set');
    }
    return value;
  }

  getTelegramFilesDirectory(): string {
    const value = this.configService.get<string>('TELEGRAM_FILES_DIRECTORY');
    if (!value) {
      throw new Error('TELEGRAM_FILES_DIRECTORY is not set');
    }
    return value;
  }
}

