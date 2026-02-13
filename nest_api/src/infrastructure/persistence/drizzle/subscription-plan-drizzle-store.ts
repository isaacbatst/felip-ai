import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  SubscriptionPlanRepository,
  SubscriptionPlanData,
  SubscriptionPlanInput,
} from '../subscription-plan.repository';
import { subscriptionPlans } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

/**
 * Default subscription plans configuration
 */
const DEFAULT_PLANS: SubscriptionPlanInput[] = [
  {
    name: 'trial',
    displayName: 'Período de Teste',
    priceInCents: 0,
    groupLimit: 3,
    durationDays: 7,
    features: ['3 grupos ativos', 'Todas as funcionalidades', 'Suporte por email'],
    isActive: false,
  },
  {
    name: 'starter',
    displayName: 'Starter',
    priceInCents: 19900, // R$199
    promotionalPriceInCents: 13900, // R$139 (30% OFF)
    promotionalMonths: 3,
    groupLimit: 3,
    durationDays: null,
    features: ['3 grupos ativos', 'Todas as funcionalidades', 'Suporte por email'],
    isActive: true,
  },
  {
    name: 'pro',
    displayName: 'Pro',
    priceInCents: 29900, // R$299
    promotionalPriceInCents: 20900, // R$209 (30% OFF)
    promotionalMonths: 3,
    groupLimit: 6,
    durationDays: null,
    features: ['6 grupos ativos', 'Todas as funcionalidades', 'Suporte prioritário'],
    isActive: true,
  },
  {
    name: 'scale',
    displayName: 'Scale',
    priceInCents: 49900, // R$499
    promotionalPriceInCents: 34900, // R$349 (30% OFF)
    promotionalMonths: 3,
    groupLimit: null, // Unlimited
    durationDays: null,
    features: ['Grupos ilimitados', 'Todas as funcionalidades', 'Suporte prioritário', 'Onboarding dedicado'],
    isActive: true,
  },
];

/**
 * Drizzle implementation of SubscriptionPlanRepository
 */
@Injectable()
export class SubscriptionPlanDrizzleStore extends SubscriptionPlanRepository {
  private readonly logger = new Logger(SubscriptionPlanDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  /**
   * Map database row to SubscriptionPlanData
   */
  private mapToPlanData(row: typeof subscriptionPlans.$inferSelect): SubscriptionPlanData {
    return {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      priceInCents: row.priceInCents,
      groupLimit: row.groupLimit,
      durationDays: row.durationDays,
      promotionalPriceInCents: row.promotionalPriceInCents,
      promotionalMonths: row.promotionalMonths,
      features: row.features as string[] | null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getActivePlans(): Promise<SubscriptionPlanData[]> {
    const result = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true));

    return result.map(this.mapToPlanData);
  }

  async getAllPlans(): Promise<SubscriptionPlanData[]> {
    const result = await this.db.select().from(subscriptionPlans);
    return result.map(this.mapToPlanData);
  }

  async getPlanById(id: number): Promise<SubscriptionPlanData | null> {
    const result = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToPlanData(result[0]);
  }

  async getPlanByName(name: string): Promise<SubscriptionPlanData | null> {
    const result = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, name))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapToPlanData(result[0]);
  }

  async createPlan(input: SubscriptionPlanInput): Promise<SubscriptionPlanData> {
    const result = await this.db
      .insert(subscriptionPlans)
      .values({
        name: input.name,
        displayName: input.displayName,
        priceInCents: input.priceInCents,
        groupLimit: input.groupLimit,
        durationDays: input.durationDays ?? null,
        promotionalPriceInCents: input.promotionalPriceInCents ?? null,
        promotionalMonths: input.promotionalMonths ?? null,
        features: input.features ?? null,
        isActive: input.isActive ?? true,
      })
      .returning();

    this.logger.log(`Created subscription plan: ${input.name}`);
    return this.mapToPlanData(result[0]);
  }

  async updatePlan(id: number, input: Partial<SubscriptionPlanInput>): Promise<SubscriptionPlanData | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.displayName !== undefined) updateData.displayName = input.displayName;
    if (input.priceInCents !== undefined) updateData.priceInCents = input.priceInCents;
    if (input.groupLimit !== undefined) updateData.groupLimit = input.groupLimit;
    if (input.durationDays !== undefined) updateData.durationDays = input.durationDays;
    if (input.promotionalPriceInCents !== undefined) updateData.promotionalPriceInCents = input.promotionalPriceInCents;
    if (input.promotionalMonths !== undefined) updateData.promotionalMonths = input.promotionalMonths;
    if (input.features !== undefined) updateData.features = input.features;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const result = await this.db
      .update(subscriptionPlans)
      .set(updateData)
      .where(eq(subscriptionPlans.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    this.logger.log(`Updated subscription plan: ${id}`);
    return this.mapToPlanData(result[0]);
  }

  async deactivatePlan(id: number): Promise<void> {
    await this.db
      .update(subscriptionPlans)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id));

    this.logger.log(`Deactivated subscription plan: ${id}`);
  }

  async seedDefaultPlans(): Promise<void> {
    for (const plan of DEFAULT_PLANS) {
      const existing = await this.getPlanByName(plan.name);
      if (!existing) {
        await this.createPlan(plan);
        this.logger.log(`Seeded subscription plan: ${plan.name}`);
      } else {
        // Sync all plan fields
        const needsUpdate =
          existing.isActive !== plan.isActive ||
          existing.priceInCents !== plan.priceInCents ||
          existing.groupLimit !== plan.groupLimit ||
          existing.promotionalPriceInCents !== (plan.promotionalPriceInCents ?? null) ||
          existing.promotionalMonths !== (plan.promotionalMonths ?? null);

        if (needsUpdate) {
          await this.updatePlan(existing.id, {
            isActive: plan.isActive,
            // priceInCents: plan.priceInCents,
            // promotionalPriceInCents: plan.promotionalPriceInCents,
            groupLimit: plan.groupLimit,
            promotionalMonths: plan.promotionalMonths,
          });
          this.logger.log(`Updated subscription plan ${plan.name}`);
        }
      }
    }
  }
}
