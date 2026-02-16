import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  SubscriptionPaymentRepository,
  SubscriptionPaymentData,
  SubscriptionPaymentStatus,
  CreateSubscriptionPaymentInput,
  UpdateSubscriptionPaymentInput,
} from '../subscription-payment.repository';
import { subscriptionPayments } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class SubscriptionPaymentDrizzleStore extends SubscriptionPaymentRepository {
  private readonly logger = new Logger(SubscriptionPaymentDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private mapToData(row: typeof subscriptionPayments.$inferSelect): SubscriptionPaymentData {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      cieloPaymentId: row.cieloPaymentId,
      amountInCents: row.amountInCents,
      status: row.status as SubscriptionPaymentStatus,
      cieloReturnCode: row.cieloReturnCode,
      cieloReturnMessage: row.cieloReturnMessage,
      authorizationCode: row.authorizationCode,
      paidAt: row.paidAt,
      failedAt: row.failedAt,
      retryCount: row.retryCount,
      createdAt: row.createdAt,
    };
  }

  async create(input: CreateSubscriptionPaymentInput): Promise<SubscriptionPaymentData> {
    const result = await this.db
      .insert(subscriptionPayments)
      .values({
        subscriptionId: input.subscriptionId,
        cieloPaymentId: input.cieloPaymentId ?? null,
        amountInCents: input.amountInCents,
        status: input.status,
        cieloReturnCode: input.cieloReturnCode ?? null,
        cieloReturnMessage: input.cieloReturnMessage ?? null,
        authorizationCode: input.authorizationCode ?? null,
        paidAt: input.paidAt ?? null,
        failedAt: input.failedAt ?? null,
      })
      .returning();

    this.logger.log(`Created payment for subscription ${input.subscriptionId}`);
    return this.mapToData(result[0]);
  }

  async getById(id: number): Promise<SubscriptionPaymentData | null> {
    const result = await this.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.id, id))
      .limit(1);

    return result.length === 0 ? null : this.mapToData(result[0]);
  }

  async getByCieloPaymentId(cieloPaymentId: string): Promise<SubscriptionPaymentData | null> {
    const result = await this.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.cieloPaymentId, cieloPaymentId))
      .limit(1);

    return result.length === 0 ? null : this.mapToData(result[0]);
  }

  async getBySubscriptionId(subscriptionId: number): Promise<SubscriptionPaymentData[]> {
    const result = await this.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, subscriptionId));

    return result.map((row) => this.mapToData(row));
  }

  async update(id: number, input: UpdateSubscriptionPaymentInput): Promise<SubscriptionPaymentData | null> {
    const updateData: Record<string, unknown> = {};

    if (input.status !== undefined) updateData.status = input.status;
    if (input.cieloReturnCode !== undefined) updateData.cieloReturnCode = input.cieloReturnCode;
    if (input.cieloReturnMessage !== undefined) updateData.cieloReturnMessage = input.cieloReturnMessage;
    if (input.authorizationCode !== undefined) updateData.authorizationCode = input.authorizationCode;
    if (input.paidAt !== undefined) updateData.paidAt = input.paidAt;
    if (input.failedAt !== undefined) updateData.failedAt = input.failedAt;
    if (input.retryCount !== undefined) updateData.retryCount = input.retryCount;

    const result = await this.db
      .update(subscriptionPayments)
      .set(updateData)
      .where(eq(subscriptionPayments.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    this.logger.log(`Updated payment ${id}`);
    return this.mapToData(result[0]);
  }
}
