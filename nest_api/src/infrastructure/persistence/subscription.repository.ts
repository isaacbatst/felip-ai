/**
 * Subscription status types
 */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

/**
 * Subscription data structure
 */
export interface SubscriptionData {
  id: number;
  userId: string;
  planId: number;
  status: SubscriptionStatus;
  // Cielo payment fields
  cieloRecurrentPaymentId: string | null;
  cieloCardToken: string | null;
  cardLastFourDigits: string | null;
  cardBrand: string | null;
  // Dates
  startDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingDate: Date | null;
  // Cancellation
  canceledAt: Date | null;
  cancelReason: string | null;
  // Trial
  trialUsed: boolean;
  // Add-ons
  extraGroups: number;
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Subscription with plan details
 */
export interface SubscriptionWithPlan extends SubscriptionData {
  plan: {
    id: number;
    name: string;
    displayName: string;
    priceInCents: number;
    groupLimit: number;
    durationDays: number | null;
    features: string[] | null;
  };
}

/**
 * Input for creating a subscription
 */
export interface CreateSubscriptionInput {
  userId: string;
  planId: number;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  trialUsed?: boolean;
  // Cielo payment fields (optional, for paid subscriptions)
  cieloRecurrentPaymentId?: string;
  cieloCardToken?: string;
  cardLastFourDigits?: string;
  cardBrand?: string;
  nextBillingDate?: Date;
}

/**
 * Input for updating a subscription
 */
export interface UpdateSubscriptionInput {
  planId?: number;
  status?: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextBillingDate?: Date | null;
  cieloRecurrentPaymentId?: string | null;
  cieloCardToken?: string | null;
  cardLastFourDigits?: string | null;
  cardBrand?: string | null;
  canceledAt?: Date | null;
  cancelReason?: string | null;
  trialUsed?: boolean;
  extraGroups?: number;
}

/**
 * Abstract repository for subscription operations
 */
export abstract class SubscriptionRepository {
  /**
   * Get a subscription by user ID
   */
  abstract getByUserId(userId: string): Promise<SubscriptionData | null>;

  /**
   * Get a subscription with plan details by user ID
   */
  abstract getWithPlanByUserId(userId: string): Promise<SubscriptionWithPlan | null>;

  /**
   * Get a subscription by ID
   */
  abstract getById(id: number): Promise<SubscriptionData | null>;

  /**
   * Create a new subscription
   */
  abstract create(input: CreateSubscriptionInput): Promise<SubscriptionData>;

  /**
   * Update a subscription
   */
  abstract update(id: number, input: UpdateSubscriptionInput): Promise<SubscriptionData | null>;

  /**
   * Update a subscription by user ID
   */
  abstract updateByUserId(userId: string, input: UpdateSubscriptionInput): Promise<SubscriptionData | null>;

  /**
   * Check if a user has used their trial
   */
  abstract hasUsedTrial(userId: string): Promise<boolean>;

  /**
   * Mark trial as used for a user
   */
  abstract markTrialUsed(userId: string): Promise<void>;

  /**
   * Get subscriptions expiring within a time window
   */
  abstract getExpiringSoon(withinHours: number): Promise<SubscriptionData[]>;

  /**
   * Get subscriptions that have expired and need status update
   */
  abstract getExpiredSubscriptions(): Promise<SubscriptionData[]>;

  /**
   * Delete a subscription (for cleanup/admin purposes)
   */
  abstract delete(id: number): Promise<void>;

  /**
   * Delete a subscription by user ID
   */
  abstract deleteByUserId(userId: string): Promise<void>;
}
