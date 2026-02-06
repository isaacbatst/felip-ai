import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SubscriptionRepository, SubscriptionWithPlan, SubscriptionStatus } from '@/infrastructure/persistence/subscription.repository';
import { SubscriptionPlanRepository, SubscriptionPlanData } from '@/infrastructure/persistence/subscription-plan.repository';
import { SubscriptionPaymentRepository } from '@/infrastructure/persistence/subscription-payment.repository';
import { AppConfigService } from '@/config/app.config';
import { CieloService } from '@/infrastructure/cielo/cielo.service';
import type { CheckoutRequestDto, CieloWebhookPayload } from '@/infrastructure/cielo/cielo.types';
import { CieloTransactionStatus } from '@/infrastructure/cielo/cielo.types';

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
 * Result of checkout operation
 */
export interface CheckoutResult {
  success: true;
  subscription: SubscriptionWithPlan;
}

/**
 * Service for managing subscriptions
 */
@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly subscriptionPlanRepository: SubscriptionPlanRepository,
    private readonly subscriptionPaymentRepository: SubscriptionPaymentRepository,
    private readonly appConfig: AppConfigService,
    private readonly cieloService: CieloService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedPlans();
  }

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
   * Checkout: create a paid subscription via Cielo recurrent payment
   */
  async checkout(userId: string, dto: CheckoutRequestDto): Promise<CheckoutResult> {
    // Check no active paid subscription exists
    const existing = await this.subscriptionRepository.getByUserId(userId);
    if (existing && this.isSubscriptionActive(existing.status)) {
      throw new SubscriptionError('Você já possui uma assinatura ativa.', 'already_subscribed');
    }

    // Fetch plan
    const plan = await this.subscriptionPlanRepository.getPlanById(dto.planId);
    if (!plan) {
      throw new SubscriptionError('Plano não encontrado.', 'plan_not_found');
    }
    if (plan.name === 'trial') {
      throw new SubscriptionError('Plano inválido para checkout.', 'plan_not_found');
    }
    if (!plan.isActive) {
      throw new SubscriptionError('Plano não está disponível.', 'plan_not_found');
    }

    // Build Cielo request
    const merchantOrderId = `SUB-${userId}-${Date.now()}`;
    const cieloRequest = {
      MerchantOrderId: merchantOrderId,
      Customer: { Name: dto.customerName },
      Payment: {
        Type: 'CreditCard' as const,
        Amount: plan.priceInCents,
        Installments: 1,
        SoftDescriptor: 'FelipAI',
        RecurrentPayment: {
          AuthorizeNow: true,
          Interval: 'Monthly' as const,
        },
        CreditCard: {
          CardNumber: dto.cardNumber,
          Holder: dto.holder,
          ExpirationDate: dto.expirationDate,
          SecurityCode: dto.securityCode,
          Brand: dto.brand,
          SaveCard: true,
        },
      },
    };

    const cieloResponse = await this.cieloService.createRecurrentPayment(cieloRequest);
    const paymentStatus = cieloResponse.Payment.Status;

    // Check if authorized or confirmed
    if (
      paymentStatus !== CieloTransactionStatus.Authorized &&
      paymentStatus !== CieloTransactionStatus.Confirmed
    ) {
      throw new SubscriptionError(
        cieloResponse.Payment.ReturnMessage || 'Pagamento recusado',
        'checkout_failed',
      );
    }

    // Delete any existing subscription (expired/canceled) before creating new
    if (existing) {
      await this.subscriptionRepository.delete(existing.id);
    }

    // Create subscription
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

    const cardNumber = dto.cardNumber.replace(/\s/g, '');
    const last4 = cardNumber.slice(-4);

    const subscription = await this.subscriptionRepository.create({
      userId,
      planId: plan.id,
      status: 'active',
      currentPeriodEnd,
      cieloRecurrentPaymentId: cieloResponse.Payment.RecurrentPayment.RecurrentPaymentId,
      cieloCardToken: cieloResponse.Payment.CreditCard.CardToken ?? undefined,
      cardLastFourDigits: last4,
      cardBrand: dto.brand,
      nextBillingDate: currentPeriodEnd,
    });

    // Create payment record
    await this.subscriptionPaymentRepository.create({
      subscriptionId: subscription.id,
      cieloPaymentId: cieloResponse.Payment.PaymentId,
      amountInCents: plan.priceInCents,
      status: 'paid',
      cieloReturnCode: cieloResponse.Payment.ReturnCode,
      cieloReturnMessage: cieloResponse.Payment.ReturnMessage,
      authorizationCode: cieloResponse.Payment.AuthorizationCode,
      paidAt: new Date(),
    });

    // Get subscription with plan details
    const subscriptionWithPlan = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscriptionWithPlan) {
      throw new SubscriptionError('Erro ao criar assinatura.', 'subscription_creation_failed');
    }

    this.logger.log(`Checkout completed for user ${userId}, plan ${plan.name}`);

    return { success: true, subscription: subscriptionWithPlan };
  }

  /**
   * Process a Cielo webhook event
   */
  async processWebhookEvent(payload: CieloWebhookPayload): Promise<void> {
    switch (payload.ChangeType) {
      case 1: // Payment status change
        await this.handlePaymentStatusChange(payload);
        break;
      case 2: // Recurrence created
        this.logger.log(`Recurrence created: ${payload.RecurrentPaymentId}`);
        break;
      case 4: // Recurring payment status change
        await this.handleRecurrenceStatusChange(payload);
        break;
      default:
        this.logger.warn(`Unknown webhook ChangeType: ${payload.ChangeType}`);
    }
  }

  private async handlePaymentStatusChange(payload: CieloWebhookPayload): Promise<void> {
    if (!payload.PaymentId) {
      this.logger.warn('Payment status change webhook without PaymentId');
      return;
    }

    // Query Cielo for payment details
    const paymentDetails = await this.cieloService.queryPayment(payload.PaymentId);
    const status = paymentDetails.Payment.Status;

    // Find or create payment record
    let payment = await this.subscriptionPaymentRepository.getByCieloPaymentId(payload.PaymentId);

    if (payment) {
      // Update existing payment
      if (status === CieloTransactionStatus.Authorized || status === CieloTransactionStatus.Confirmed) {
        await this.subscriptionPaymentRepository.update(payment.id, {
          status: 'paid',
          cieloReturnCode: paymentDetails.Payment.ReturnCode,
          cieloReturnMessage: paymentDetails.Payment.ReturnMessage,
          paidAt: new Date(),
        });

        // Extend subscription period
        const subscription = await this.subscriptionRepository.getById(payment.subscriptionId);
        if (subscription) {
          const newEnd = new Date();
          newEnd.setDate(newEnd.getDate() + 30);
          await this.subscriptionRepository.update(subscription.id, {
            status: 'active',
            currentPeriodEnd: newEnd,
            currentPeriodStart: new Date(),
            nextBillingDate: newEnd,
          });
          this.logger.log(`Extended subscription ${subscription.id} to ${newEnd.toISOString()}`);
        }
      } else if (status === CieloTransactionStatus.Denied) {
        const newRetryCount = payment.retryCount + 1;
        await this.subscriptionPaymentRepository.update(payment.id, {
          status: 'failed',
          cieloReturnCode: paymentDetails.Payment.ReturnCode,
          cieloReturnMessage: paymentDetails.Payment.ReturnMessage,
          failedAt: new Date(),
          retryCount: newRetryCount,
        });

        // Set past_due after 3 failures
        if (newRetryCount >= 3) {
          const subscription = await this.subscriptionRepository.getById(payment.subscriptionId);
          if (subscription) {
            await this.subscriptionRepository.update(subscription.id, {
              status: 'past_due',
            });
            this.logger.warn(`Subscription ${subscription.id} set to past_due after ${newRetryCount} failures`);
          }
        }
      }
    } else {
      // New payment from recurrence — find subscription by recurrentPaymentId
      const recurrentId = payload.RecurrentPaymentId || paymentDetails.Payment.RecurrentPayment?.RecurrentPaymentId;
      if (!recurrentId) {
        this.logger.warn(`Cannot find subscription for payment ${payload.PaymentId}`);
        return;
      }

      const subscription = await this.subscriptionRepository.getByCieloRecurrentPaymentId(recurrentId);
      if (!subscription) {
        this.logger.warn(`No subscription found for recurrentPaymentId ${recurrentId}`);
        return;
      }

      const isPaid = status === CieloTransactionStatus.Authorized || status === CieloTransactionStatus.Confirmed;

      // Create payment record
      await this.subscriptionPaymentRepository.create({
        subscriptionId: subscription.id,
        cieloPaymentId: payload.PaymentId,
        amountInCents: paymentDetails.Payment.Amount,
        status: isPaid ? 'paid' : 'failed',
        cieloReturnCode: paymentDetails.Payment.ReturnCode,
        cieloReturnMessage: paymentDetails.Payment.ReturnMessage,
        authorizationCode: paymentDetails.Payment.AuthorizationCode,
        paidAt: isPaid ? new Date() : undefined,
        failedAt: isPaid ? undefined : new Date(),
      });

      if (isPaid) {
        const newEnd = new Date();
        newEnd.setDate(newEnd.getDate() + 30);
        await this.subscriptionRepository.update(subscription.id, {
          status: 'active',
          currentPeriodEnd: newEnd,
          currentPeriodStart: new Date(),
          nextBillingDate: newEnd,
        });
        this.logger.log(`Renewed subscription ${subscription.id} to ${newEnd.toISOString()}`);
      }
    }
  }

  private async handleRecurrenceStatusChange(payload: CieloWebhookPayload): Promise<void> {
    if (!payload.RecurrentPaymentId) {
      this.logger.warn('Recurrence status change webhook without RecurrentPaymentId');
      return;
    }

    const subscription = await this.subscriptionRepository.getByCieloRecurrentPaymentId(payload.RecurrentPaymentId);
    if (!subscription) {
      this.logger.warn(`No subscription found for recurrentPaymentId ${payload.RecurrentPaymentId}`);
      return;
    }

    // ChangeType 4 = recurrence deactivated, mark subscription as canceled
    await this.subscriptionRepository.update(subscription.id, {
      status: 'canceled',
      canceledAt: new Date(),
      cancelReason: 'Recorrência desativada pela Cielo',
    });
    this.logger.log(`Subscription ${subscription.id} canceled due to recurrence deactivation`);
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
