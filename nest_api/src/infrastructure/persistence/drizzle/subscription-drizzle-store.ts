import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, and, lt, lte, gte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  SubscriptionRepository,
  SubscriptionData,
  SubscriptionWithPlan,
  SubscriptionStatus,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
} from '../subscription.repository';
import { subscriptions, subscriptionPlans } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Drizzle implementation of SubscriptionRepository
 */
@Injectable()
export class SubscriptionDrizzleStore extends SubscriptionRepository {
  private readonly logger = new Logger(SubscriptionDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Map database row to SubscriptionData
   */
  private mapToSubscriptionData(row: typeof subscriptions.$inferSelect): SubscriptionData {
    return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      status: row.status as SubscriptionStatus,
      cieloRecurrentPaymentId: row.cieloRecurrentPaymentId,
      cieloCardToken: row.cieloCardToken,
      cardLastFourDigits: row.cardLastFourDigits,
      cardBrand: row.cardBrand,
      startDate: row.startDate,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      nextBillingDate: row.nextBillingDate,
      canceledAt: row.canceledAt,
      cancelReason: row.cancelReason,
      trialUsed: row.trialUsed,
      promotionalPaymentsRemaining: row.promotionalPaymentsRemaining,
      extraGroups: row.extraGroups,
      couponId: row.couponId,
      bonusGroups: row.bonusGroups,
      couponDiscountMonthsRemaining: row.couponDiscountMonthsRemaining,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getByUserId(userId: string): Promise<SubscriptionData | null> {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToSubscriptionData(result[0]);
  }

  async getWithPlanByUserId(userId: string): Promise<SubscriptionWithPlan | null> {
    const result = await this.db
      .select({
        subscription: subscriptions,
        plan: subscriptionPlans,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const { subscription, plan } = result[0];
    return {
      ...this.mapToSubscriptionData(subscription),
      plan: {
        id: plan.id,
        name: plan.name,
        displayName: plan.displayName,
        priceInCents: plan.priceInCents,
        groupLimit: plan.groupLimit,
        durationDays: plan.durationDays,
        promotionalPriceInCents: plan.promotionalPriceInCents,
        promotionalMonths: plan.promotionalMonths,
        features: plan.features as string[] | null,
      },
    };
  }

  async getById(id: number): Promise<SubscriptionData | null> {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToSubscriptionData(result[0]);
  }

  async create(input: CreateSubscriptionInput): Promise<SubscriptionData> {
    const result = await this.db
      .insert(subscriptions)
      .values({
        userId: input.userId,
        planId: input.planId,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
        trialUsed: input.trialUsed ?? false,
        promotionalPaymentsRemaining: input.promotionalPaymentsRemaining ?? 0,
        cieloRecurrentPaymentId: input.cieloRecurrentPaymentId ?? null,
        cieloCardToken: input.cieloCardToken ?? null,
        cardLastFourDigits: input.cardLastFourDigits ?? null,
        cardBrand: input.cardBrand ?? null,
        nextBillingDate: input.nextBillingDate ?? null,
        couponId: input.couponId ?? null,
        bonusGroups: input.bonusGroups ?? 0,
        couponDiscountMonthsRemaining: input.couponDiscountMonthsRemaining ?? 0,
      })
      .returning();

    this.logger.log(`Created subscription for user ${input.userId} with plan ${input.planId}`);
    return this.mapToSubscriptionData(result[0]);
  }

  async update(id: number, input: UpdateSubscriptionInput): Promise<SubscriptionData | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.planId !== undefined) updateData.planId = input.planId;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.currentPeriodStart !== undefined) updateData.currentPeriodStart = input.currentPeriodStart;
    if (input.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = input.currentPeriodEnd;
    if (input.nextBillingDate !== undefined) updateData.nextBillingDate = input.nextBillingDate;
    if (input.cieloRecurrentPaymentId !== undefined) updateData.cieloRecurrentPaymentId = input.cieloRecurrentPaymentId;
    if (input.cieloCardToken !== undefined) updateData.cieloCardToken = input.cieloCardToken;
    if (input.cardLastFourDigits !== undefined) updateData.cardLastFourDigits = input.cardLastFourDigits;
    if (input.cardBrand !== undefined) updateData.cardBrand = input.cardBrand;
    if (input.canceledAt !== undefined) updateData.canceledAt = input.canceledAt;
    if (input.cancelReason !== undefined) updateData.cancelReason = input.cancelReason;
    if (input.trialUsed !== undefined) updateData.trialUsed = input.trialUsed;
    if (input.promotionalPaymentsRemaining !== undefined) updateData.promotionalPaymentsRemaining = input.promotionalPaymentsRemaining;
    if (input.extraGroups !== undefined) updateData.extraGroups = input.extraGroups;
    if (input.couponId !== undefined) updateData.couponId = input.couponId;
    if (input.bonusGroups !== undefined) updateData.bonusGroups = input.bonusGroups;
    if (input.couponDiscountMonthsRemaining !== undefined) updateData.couponDiscountMonthsRemaining = input.couponDiscountMonthsRemaining;

    const result = await this.db
      .update(subscriptions)
      .set(updateData)
      .where(eq(subscriptions.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    this.logger.log(`Updated subscription ${id}`);
    return this.mapToSubscriptionData(result[0]);
  }

  async updateByUserId(userId: string, input: UpdateSubscriptionInput): Promise<SubscriptionData | null> {
    const subscription = await this.getByUserId(userId);
    if (!subscription) {
      return null;
    }
    return this.update(subscription.id, input);
  }

  async hasUsedTrial(userId: string): Promise<boolean> {
    const result = await this.db
      .select({ trialUsed: subscriptions.trialUsed })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return false;
    }

    return result[0].trialUsed;
  }

  async markTrialUsed(userId: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ trialUsed: true, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));

    this.logger.log(`Marked trial as used for user ${userId}`);
  }

  async getExpiringSoon(withinHours: number): Promise<SubscriptionData[]> {
    const futureDate = new Date(Date.now() + withinHours * 60 * 60 * 1000);
    const now = new Date();

    const result = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          lte(subscriptions.currentPeriodEnd, futureDate),
          gte(subscriptions.currentPeriodEnd, now),
          eq(subscriptions.status, 'trialing'),
        ),
      );

    return result.map(this.mapToSubscriptionData);
  }

  async getExpiredSubscriptions(): Promise<SubscriptionData[]> {
    const now = new Date();

    const result = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          lt(subscriptions.currentPeriodEnd, now),
          eq(subscriptions.status, 'trialing'),
        ),
      );

    return result.map(this.mapToSubscriptionData);
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(subscriptions).where(eq(subscriptions.id, id));
    this.logger.log(`Deleted subscription ${id}`);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    this.logger.log(`Deleted subscription for user ${userId}`);
  }

  async getByCieloRecurrentPaymentId(recurrentPaymentId: string): Promise<SubscriptionData | null> {
    const result = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.cieloRecurrentPaymentId, recurrentPaymentId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToSubscriptionData(result[0]);
  }
}
