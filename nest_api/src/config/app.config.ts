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
      'WORKER_ENV_FILE',
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

  getTelegramBotUsername(): string {
    return this.configService.get<string>('TELEGRAM_BOT_USERNAME', '');
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
    const value = this.configService.get<string>('PRICE_TABLE_CACHE_TTL_SECONDS', '60');
    return Number.parseInt(value, 10);
  }

  getOpenAIApiKey(): string {
    const value = this.configService.get<string>('OPENAI_API_KEY');
    if (!value) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    return value;
  }

  getWorkerEnvFile(): string {
    const value = this.configService.get<string>('WORKER_ENV_FILE');
    if (!value) {
      throw new Error('WORKER_ENV_FILE is not set');
    }
    return value;
  }

  getWorkerManagerType(): 'compose' | 'swarm' {
    const value = this.configService.get<string>('WORKER_MANAGER_TYPE', 'compose');
    if (value !== 'compose' && value !== 'swarm') {
      throw new Error(`WORKER_MANAGER_TYPE must be either 'compose' or 'swarm', got: ${value}`);
    }
    return value;
  }

  /**
   * HTTP server port for the hybrid app
   * Used for serving the auth code web page and API endpoints
   */
  getHttpPort(): number {
    const value = this.configService.get<string>('HTTP_PORT', '3000');
    return Number.parseInt(value, 10);
  }

  /**
   * Base URL for the application
   * Used for generating auth links sent to users
   * Should include protocol (https://) and domain, no trailing slash
   */
  getAppBaseUrl(): string {
    return this.configService.get<string>('APP_BASE_URL', 'http://localhost:3000');
  }

  /**
   * Auth token time-to-live in minutes
   * Determines how long auth tokens are valid before expiring
   */
  getAuthTokenTtlMinutes(): number {
    const value = this.configService.get<string>('AUTH_TOKEN_TTL_MINUTES', '10');
    return Number.parseInt(value, 10);
  }

  /**
   * Dashboard token time-to-live in minutes
   * Determines how long dashboard access tokens are valid before expiring
   */
  getDashboardTokenTtlMinutes(): number {
    const value = this.configService.get<string>('DASHBOARD_TOKEN_TTL_MINUTES', '60');
    return Number.parseInt(value, 10);
  }

  // ============================================================================
  // Subscription System Configuration
  // ============================================================================

  /**
   * Authorization mode for the application
   * - whitelist: Only phone numbers in TELEGRAM_PHONE are authorized
   * - subscription: Only users with active subscriptions are authorized
   * - hybrid: Check whitelist first, then subscription
   */
  getAuthorizationMode(): 'whitelist' | 'subscription' | 'hybrid' {
    const value = this.configService.get<string>('AUTHORIZATION_MODE', 'hybrid');
    if (value !== 'whitelist' && value !== 'subscription' && value !== 'hybrid') {
      return 'whitelist';
    }
    return value;
  }

  /**
   * Whether Cielo payment integration is enabled
   */
  isCieloEnabled(): boolean {
    const value = this.configService.get<string>('FEATURE_CIELO_ENABLED', 'false');
    return value === 'true';
  }

  /**
   * Cielo Merchant ID for API authentication
   */
  getCieloMerchantId(): string {
    const value = this.configService.get<string>('CIELO_MERCHANT_ID');
    if (!value && this.isCieloEnabled()) {
      throw new Error('CIELO_MERCHANT_ID is required when FEATURE_CIELO_ENABLED is true');
    }
    return value ?? '';
  }

  /**
   * Cielo Merchant Key for API authentication
   */
  getCieloMerchantKey(): string {
    const value = this.configService.get<string>('CIELO_MERCHANT_KEY');
    if (!value && this.isCieloEnabled()) {
      throw new Error('CIELO_MERCHANT_KEY is required when FEATURE_CIELO_ENABLED is true');
    }
    return value ?? '';
  }

  /**
   * Cielo environment (sandbox or production)
   */
  getCieloEnvironment(): 'sandbox' | 'production' {
    const value = this.configService.get<string>('CIELO_ENVIRONMENT', 'sandbox');
    if (value !== 'sandbox' && value !== 'production') {
      return 'sandbox';
    }
    return value;
  }

  /**
   * Cielo webhook secret for validating incoming webhooks
   */
  getCieloWebhookSecret(): string {
    return this.configService.get<string>('CIELO_WEBHOOK_SECRET', '');
  }

  /**
   * Subscription token time-to-live in minutes
   * Determines how long subscription page access tokens are valid before expiring
   */
  getSubscriptionTokenTtlMinutes(): number {
    const value = this.configService.get<string>('SUBSCRIPTION_TOKEN_TTL_MINUTES', '60');
    return Number.parseInt(value, 10);
  }

  /**
   * Trial period duration in days
   */
  getTrialDurationDays(): number {
    const value = this.configService.get<string>('TRIAL_DURATION_DAYS', '7');
    return Number.parseInt(value, 10);
  }
}

