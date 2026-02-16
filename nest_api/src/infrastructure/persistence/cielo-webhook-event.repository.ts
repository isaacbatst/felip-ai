/**
 * Cielo webhook event data structure
 */
export interface CieloWebhookEventData {
  id: number;
  paymentId: string | null;
  recurrentPaymentId: string | null;
  changeType: number;
  rawPayload: unknown;
  processedAt: Date | null;
  processingError: string | null;
  createdAt: Date;
}

/**
 * Input for creating a webhook event
 */
export interface CreateCieloWebhookEventInput {
  paymentId?: string;
  recurrentPaymentId?: string;
  changeType: number;
  rawPayload: unknown;
}

/**
 * Abstract repository for Cielo webhook event operations
 */
export abstract class CieloWebhookEventRepository {
  abstract create(input: CreateCieloWebhookEventInput): Promise<CieloWebhookEventData>;
  abstract markProcessed(id: number): Promise<void>;
  abstract markError(id: number, error: string): Promise<void>;
  abstract getByPaymentId(paymentId: string): Promise<CieloWebhookEventData[]>;
}
