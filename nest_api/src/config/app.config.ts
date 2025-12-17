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
    ];

    for (const varName of requiredVars) {
      const value = this.configService.get<string>(varName);
      if (!value) {
        throw new Error(`${varName} is not set`);
      }
    }
  }

  getQueueMaxItems(): number {
    const value = this.configService.get<string>('QUEUE_MAX_ITEMS', '1000');
    if (!value) {
      throw new Error('QUEUE_MAX_ITEMS is not set');
    }
    return Number.parseInt(value, 10);
  }

  getTelegramBotToken(): string {
    const value = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!value) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    return value;
  }

  getTelegramPhones(): string[] {
    return this.configService.get<string>('TELEGRAM_PHONE', '+5584987287398,+5584994531473').split(',');
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

