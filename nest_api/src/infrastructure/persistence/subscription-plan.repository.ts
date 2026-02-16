/**
 * Subscription plan data structure
 */
export interface SubscriptionPlanData {
  id: number;
  name: string;
  displayName: string;
  priceInCents: number;
  groupLimit: number | null;
  durationDays: number | null;
  promotionalPriceInCents: number | null;
  promotionalMonths: number | null;
  features: string[] | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating/updating a subscription plan
 */
export interface SubscriptionPlanInput {
  name: string;
  displayName: string;
  priceInCents: number;
  groupLimit: number | null;
  durationDays?: number | null;
  promotionalPriceInCents?: number | null;
  promotionalMonths?: number | null;
  features?: string[];
  isActive?: boolean;
}

/**
 * Abstract repository for subscription plan operations
 */
export abstract class SubscriptionPlanRepository {
  /**
   * Get all active subscription plans
   */
  abstract getActivePlans(): Promise<SubscriptionPlanData[]>;

  /**
   * Get all subscription plans (including inactive)
   */
  abstract getAllPlans(): Promise<SubscriptionPlanData[]>;

  /**
   * Get a plan by ID
   */
  abstract getPlanById(id: number): Promise<SubscriptionPlanData | null>;

  /**
   * Get a plan by name
   */
  abstract getPlanByName(name: string): Promise<SubscriptionPlanData | null>;

  /**
   * Create a new subscription plan
   */
  abstract createPlan(input: SubscriptionPlanInput): Promise<SubscriptionPlanData>;

  /**
   * Update a subscription plan
   */
  abstract updatePlan(id: number, input: Partial<SubscriptionPlanInput>): Promise<SubscriptionPlanData | null>;

  /**
   * Deactivate a subscription plan
   */
  abstract deactivatePlan(id: number): Promise<void>;

  /**
   * Seed default plans if they don't exist
   */
  abstract seedDefaultPlans(): Promise<void>;
}
