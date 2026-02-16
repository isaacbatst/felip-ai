import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  CieloWebhookEventRepository,
  CieloWebhookEventData,
  CreateCieloWebhookEventInput,
} from '../cielo-webhook-event.repository';
import { cieloWebhookEvents } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class CieloWebhookEventDrizzleStore extends CieloWebhookEventRepository {
  private readonly logger = new Logger(CieloWebhookEventDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private mapToData(row: typeof cieloWebhookEvents.$inferSelect): CieloWebhookEventData {
    return {
      id: row.id,
      paymentId: row.paymentId,
      recurrentPaymentId: row.recurrentPaymentId,
      changeType: row.changeType,
      rawPayload: row.rawPayload,
      processedAt: row.processedAt,
      processingError: row.processingError,
      createdAt: row.createdAt,
    };
  }

  async create(input: CreateCieloWebhookEventInput): Promise<CieloWebhookEventData> {
    const result = await this.db
      .insert(cieloWebhookEvents)
      .values({
        paymentId: input.paymentId ?? null,
        recurrentPaymentId: input.recurrentPaymentId ?? null,
        changeType: input.changeType,
        rawPayload: input.rawPayload,
      })
      .returning();

    this.logger.log(`Created webhook event for changeType=${input.changeType}`);
    return this.mapToData(result[0]);
  }

  async markProcessed(id: number): Promise<void> {
    await this.db
      .update(cieloWebhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(cieloWebhookEvents.id, id));
  }

  async markError(id: number, error: string): Promise<void> {
    await this.db
      .update(cieloWebhookEvents)
      .set({ processingError: error })
      .where(eq(cieloWebhookEvents.id, id));
  }

  async getByPaymentId(paymentId: string): Promise<CieloWebhookEventData[]> {
    const result = await this.db
      .select()
      .from(cieloWebhookEvents)
      .where(eq(cieloWebhookEvents.paymentId, paymentId));

    return result.map((row) => this.mapToData(row));
  }
}
