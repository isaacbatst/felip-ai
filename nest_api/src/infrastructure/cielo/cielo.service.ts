import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@/config/app.config';
import type {
  CieloCreateRecurrentPaymentRequest,
  CieloCreateRecurrentPaymentResponse,
  CieloQueryPaymentResponse,
} from './cielo.types';

@Injectable()
export class CieloService {
  private readonly logger = new Logger(CieloService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  private getApiUrl(): string {
    const env = this.appConfig.getCieloEnvironment();
    return env === 'production'
      ? 'https://api.cieloecommerce.cielo.com.br'
      : 'https://apisandbox.cieloecommerce.cielo.com.br';
  }

  private getQueryApiUrl(): string {
    const env = this.appConfig.getCieloEnvironment();
    return env === 'production'
      ? 'https://apiquery.cieloecommerce.cielo.com.br'
      : 'https://apiquerysandbox.cieloecommerce.cielo.com.br';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      MerchantId: this.appConfig.getCieloMerchantId(),
      MerchantKey: this.appConfig.getCieloMerchantKey(),
    };
  }

  async createRecurrentPayment(
    request: CieloCreateRecurrentPaymentRequest,
  ): Promise<CieloCreateRecurrentPaymentResponse> {
    const url = `${this.getApiUrl()}/1/sales/`;
    const body = JSON.stringify(request);
    this.logger.log(`Creating recurrent payment for order ${request.MerchantOrderId}, request JSON: ${body}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body,
    });

    const text = await response.text();

    if (!response.ok) {
      this.logger.error(`Cielo API error: ${response.status}`, text);
      throw new Error(`Cielo API error: ${response.status} - ${text}`);
    }

    const data = JSON.parse(text) as CieloCreateRecurrentPaymentResponse;
    this.logger.log(`Recurrent payment created for order ${request.MerchantOrderId}, response JSON: ${text}`);

    return data;
  }

  async queryPayment(paymentId: string): Promise<CieloQueryPaymentResponse> {
    const url = `${this.getQueryApiUrl()}/1/sales/${paymentId}`;
    this.logger.log(`Querying payment ${paymentId}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    const text = await response.text();

    if (!response.ok) {
      this.logger.error(`Cielo query API error: ${response.status}`, text);
      throw new Error(`Cielo query API error: ${response.status} - ${text}`);
    }

    return JSON.parse(text) as CieloQueryPaymentResponse;
  }

  async updateRecurrenceAmount(recurrentPaymentId: string, newAmountInCents: number): Promise<void> {
    const url = `${this.getApiUrl()}/1/RecurrentPayment/${recurrentPaymentId}/Amount`;
    this.logger.log(`Updating recurrence ${recurrentPaymentId} amount to ${newAmountInCents}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(newAmountInCents),
    });

    if (!response.ok) {
      const data = await response.text();
      this.logger.error(`Cielo update amount error: ${response.status}`, data);
      throw new Error(`Cielo update amount error: ${response.status} - ${data}`);
    }
  }

  async deactivateRecurrence(recurrentPaymentId: string): Promise<void> {
    const url = `${this.getApiUrl()}/1/RecurrentPayment/${recurrentPaymentId}/Deactivate`;
    this.logger.log(`Deactivating recurrence ${recurrentPaymentId}`);

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const data = await response.text();
      this.logger.error(`Cielo deactivate error: ${response.status}`, data);
      throw new Error(`Cielo deactivate error: ${response.status} - ${data}`);
    }
  }
}
