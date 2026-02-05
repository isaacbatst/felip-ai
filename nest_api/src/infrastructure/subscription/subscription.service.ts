import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRepository, SubscriptionWithPlan, SubscriptionStatus } from '@/infrastructure/persistence/subscription.repository';
import { SubscriptionPlanRepository, SubscriptionPlanData } from '@/infrastructure/persistence/subscription-plan.repository';
import { AppConfigService } from '@/config/app.config';

/**
 * Error types for subscription operations
 */
export class SubscriptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/**
 * Result of trial start operation
 */
export interface StartTrialResult {
  success: true;
  subscription: SubscriptionWithPlan;
}

/**
 * Service for managing subscriptions
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly subscriptionPlanRepository: SubscriptionPlanRepository,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Start a free trial for a user
   * @throws SubscriptionError if user already used trial or has active subscription
   */
  async startTrial(userId: string): Promise<StartTrialResult> {
    // Check if user has already used their trial
    const hasUsedTrial = await this.subscriptionRepository.hasUsedTrial(userId);
    if (hasUsedTrial) {
      throw new SubscriptionError(
        'Você já utilizou seu período de teste gratuito.',
        'trial_already_used',
      );
    }

    // Check if user already has an active subscription
    const existingSubscription = await this.subscriptionRepository.getByUserId(userId);
    if (existingSubscription && this.isSubscriptionActive(existingSubscription.status)) {
      throw new SubscriptionError(
        'Você já possui uma assinatura ativa.',
        'already_subscribed',
      );
    }

    // Get the trial plan
    const trialPlan = await this.subscriptionPlanRepository.getPlanByName('trial');
    if (!trialPlan) {
      throw new SubscriptionError(
        'Plano de teste não encontrado. Entre em contato com o suporte.',
        'trial_plan_not_found',
      );
    }

    // Calculate trial end date
    const trialDurationDays = trialPlan.durationDays ?? this.appConfig.getTrialDurationDays();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + trialDurationDays);

    // Delete any existing subscription (e.g., expired) before creating new one
    if (existingSubscription) {
      await this.subscriptionRepository.delete(existingSubscription.id);
    }

    // Create trial subscription
    const subscription = await this.subscriptionRepository.create({
      userId,
      planId: trialPlan.id,
      status: 'trialing',
      currentPeriodEnd,
      trialUsed: true,
    });

    // Get subscription with plan details
    const subscriptionWithPlan = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscriptionWithPlan) {
      throw new SubscriptionError(
        'Erro ao criar assinatura. Tente novamente.',
        'subscription_creation_failed',
      );
    }

    this.logger.log(`Trial started for user ${userId}, expires at ${currentPeriodEnd.toISOString()}`);

    return {
      success: true,
      subscription: subscriptionWithPlan,
    };
  }

  /**
   * Get a user's subscription with plan details
   */
  async getSubscription(userId: string): Promise<SubscriptionWithPlan | null> {
    return this.subscriptionRepository.getWithPlanByUserId(userId);
  }

  /**
   * Check if a user has used their free trial
   */
  async hasUsedTrial(userId: string): Promise<boolean> {
    return this.subscriptionRepository.hasUsedTrial(userId);
  }

  /**
   * Get all active subscription plans (excluding trial)
   */
  async getActivePlans(): Promise<SubscriptionPlanData[]> {
    const plans = await this.subscriptionPlanRepository.getActivePlans();
    // Filter out trial plan for public listing
    return plans.filter(p => p.name !== 'trial');
  }

  /**
   * Get all subscription plans including trial
   */
  async getAllPlans(): Promise<SubscriptionPlanData[]> {
    return this.subscriptionPlanRepository.getActivePlans();
  }

  /**
   * Check if a subscription status is considered "active"
   */
  isSubscriptionActive(status: SubscriptionStatus): boolean {
    return status === 'active' || status === 'trialing';
  }

  /**
   * Check if a user's trial has expired
   */
  async isTrialExpired(userId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.getByUserId(userId);
    if (!subscription) {
      return false; // No subscription means no trial to expire
    }

    if (subscription.status !== 'trialing') {
      return false; // Not a trial subscription
    }

    return subscription.currentPeriodEnd < new Date();
  }

  /**
   * Get the total group limit for a user (plan limit + extra groups)
   */
  async getGroupLimit(userId: string): Promise<number> {
    const subscription = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscription) {
      return 0;
    }

    return subscription.plan.groupLimit + subscription.extraGroups;
  }

  /**
   * Check if a user can add more groups
   */
  async canAddGroup(userId: string, currentGroupCount: number): Promise<boolean> {
    const limit = await this.getGroupLimit(userId);
    return currentGroupCount < limit;
  }

  /**
   * Calculate days remaining in current subscription period
   */
  async getDaysRemaining(userId: string): Promise<number | null> {
    const subscription = await this.subscriptionRepository.getByUserId(userId);
    if (!subscription) {
      return null;
    }

    const now = new Date();
    const end = subscription.currentPeriodEnd;
    const diffMs = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Seed default subscription plans
   */
  async seedPlans(): Promise<void> {
    await this.subscriptionPlanRepository.seedDefaultPlans();
    this.logger.log('Default subscription plans seeded');
  }

  /**
   * Update expired trials to expired status
   */
  async processExpiredTrials(): Promise<number> {
    const expiredTrials = await this.subscriptionRepository.getExpiredSubscriptions();
    let count = 0;

    for (const subscription of expiredTrials) {
      await this.subscriptionRepository.update(subscription.id, {
        status: 'expired',
      });
      count++;
      this.logger.log(`Marked subscription ${subscription.id} as expired for user ${subscription.userId}`);
    }

    return count;
  }
}
