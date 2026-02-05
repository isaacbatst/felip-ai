import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionRepository } from '@/infrastructure/persistence/subscription.repository';

/**
 * Service for checking subscription-based authorization
 */
@Injectable()
export class SubscriptionAuthorizationService {
  private readonly logger = new Logger(SubscriptionAuthorizationService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  /**
   * Check if a user is authorized based on their subscription status
   * @param userId - The user ID to check
   * @returns true if user has an active subscription (active or valid trial)
   */
  async isAuthorized(userId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.getByUserId(userId);

    if (!subscription) {
      return false;
    }

    // Check if subscription is in an active status
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return false;
    }

    // Check if subscription period has expired
    if (subscription.currentPeriodEnd < new Date()) {
      this.logger.debug(`Subscription expired for user ${userId}`);
      return false;
    }

    return true;
  }

  /**
   * Get detailed authorization info for a user
   */
  async getAuthorizationInfo(userId: string): Promise<{
    authorized: boolean;
    reason?: string;
    expiresAt?: Date;
    status?: string;
  }> {
    const subscription = await this.subscriptionRepository.getByUserId(userId);

    if (!subscription) {
      return {
        authorized: false,
        reason: 'no_subscription',
      };
    }

    if (subscription.status === 'canceled') {
      return {
        authorized: false,
        reason: 'subscription_canceled',
        status: subscription.status,
      };
    }

    if (subscription.status === 'expired') {
      return {
        authorized: false,
        reason: 'subscription_expired',
        status: subscription.status,
      };
    }

    if (subscription.status === 'past_due') {
      return {
        authorized: false,
        reason: 'payment_past_due',
        status: subscription.status,
      };
    }

    if (subscription.currentPeriodEnd < new Date()) {
      return {
        authorized: false,
        reason: 'period_expired',
        expiresAt: subscription.currentPeriodEnd,
        status: subscription.status,
      };
    }

    return {
      authorized: true,
      expiresAt: subscription.currentPeriodEnd,
      status: subscription.status,
    };
  }
}
