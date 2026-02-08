import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SubscriptionRepository, SubscriptionData, SubscriptionWithPlan, SubscriptionStatus } from '@/infrastructure/persistence/subscription.repository';
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
   * Start a trial for a user with card info via Cielo (AuthorizeNow=false)
   * @throws SubscriptionError if user already used trial or has active subscription
   */
  async startTrial(userId: string, dto: CheckoutRequestDto): Promise<StartTrialResult> {
    // Check if user has already used their trial
    const hasUsedTrial = await this.subscriptionRepository.hasUsedTrial(userId);
    if (hasUsedTrial) {
      throw new SubscriptionError(
        'Você já utilizou seu período de teste gratuito.',
        'trial_already_used',
      );
    }

    // Check if user already has an active subscription
    const existing = await this.subscriptionRepository.getByUserId(userId);
    if (existing && this.isSubscriptionActive(existing.status)) {
      throw new SubscriptionError(
        'Você já possui uma assinatura ativa.',
        'already_subscribed',
      );
    }

    // Fetch the real plan (starter/pro/scale — reject trial plan)
    const plan = await this.subscriptionPlanRepository.getPlanById(dto.planId);
    if (!plan) {
      throw new SubscriptionError('Plano não encontrado.', 'plan_not_found');
    }
    if (plan.name === 'trial') {
      throw new SubscriptionError('Plano inválido para trial.', 'plan_not_found');
    }
    if (!plan.isActive) {
      throw new SubscriptionError('Plano não está disponível.', 'plan_not_found');
    }

    // Calculate StartDate = today + trial days
    const trialDurationDays = this.appConfig.getTrialDurationDays();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + trialDurationDays);
    const startDateStr = startDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

    this.logger.log(`Starting trial for user ${userId}, plan ${plan.name}, start date ${startDateStr}`);

    // Create Cielo subscription with AuthorizeNow=false
    const result = await this.createCieloSubscription({
      userId,
      dto,
      plan,
      authorizeNow: false,
      startDate: startDateStr,
      subscriptionStatus: 'trialing',
      existing,
      trialUsed: true,
      currentPeriodEnd: startDate,
    });

    this.logger.log(`Trial started for user ${userId}, plan ${plan.name}, first charge at ${startDateStr}`);

    return { success: true, subscription: result };
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
   * Returns Infinity when groupLimit is null (unlimited)
   */
  async getGroupLimit(userId: string): Promise<number> {
    const subscription = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscription) {
      return 0;
    }

    if (subscription.plan.groupLimit === null) {
      return Infinity;
    }

    return subscription.plan.groupLimit + subscription.extraGroups;
  }

  /**
   * Check if a user can add more groups
   */
  async canAddGroup(userId: string, currentGroupCount: number): Promise<boolean> {
    const subscription = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscription) {
      return false;
    }

    if (subscription.plan.groupLimit === null) {
      return true;
    }

    const limit = subscription.plan.groupLimit + subscription.extraGroups;
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
   * Checkout: create a paid subscription via Cielo recurrent payment.
   * If user is trialing, deactivates old recurrence and creates new with immediate charge.
   */
  async checkout(userId: string, dto: CheckoutRequestDto): Promise<CheckoutResult> {
    const existing = await this.subscriptionRepository.getByUserId(userId);

    // Only block if already active (paid) — trialing users can upgrade
    if (existing && existing.status === 'active') {
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

    // If user is trialing with a Cielo recurrence, deactivate it first
    if (existing?.status === 'trialing' && existing.cieloRecurrentPaymentId) {
      try {
        await this.cieloService.deactivateRecurrence(existing.cieloRecurrentPaymentId);
        this.logger.log(`Deactivated trial recurrence ${existing.cieloRecurrentPaymentId} for upgrade`);
      } catch (error) {
        this.logger.warn(`Failed to deactivate trial recurrence: ${error}`);
      }
    }

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

    const result = await this.createCieloSubscription({
      userId,
      dto,
      plan,
      authorizeNow: true,
      subscriptionStatus: 'active',
      existing,
      currentPeriodEnd,
    });

    this.logger.log(`Checkout completed for user ${userId}, plan ${plan.name}`);

    return { success: true, subscription: result };
  }

  /**
   * Cancel a trial or active subscription
   */
  async cancelSubscription(userId: string): Promise<void> {
    const existing = await this.subscriptionRepository.getByUserId(userId);
    if (!existing) {
      throw new SubscriptionError('Nenhuma assinatura encontrada.', 'no_subscription');
    }
    if (existing.status === 'canceled' || existing.status === 'expired') {
      throw new SubscriptionError('Assinatura já está cancelada.', 'already_canceled');
    }

    // Deactivate Cielo recurrence if exists
    if (existing.cieloRecurrentPaymentId) {
      try {
        await this.cieloService.deactivateRecurrence(existing.cieloRecurrentPaymentId);
        this.logger.log(`Deactivated recurrence ${existing.cieloRecurrentPaymentId} for user ${userId}`);
      } catch (error) {
        this.logger.warn(`Failed to deactivate recurrence for cancel: ${error}`);
      }
    }

    await this.subscriptionRepository.update(existing.id, {
      status: 'canceled',
      canceledAt: new Date(),
      cancelReason: 'Cancelado pelo usuário',
    });

    this.logger.log(`Subscription ${existing.id} canceled by user ${userId}`);
  }

  /**
   * Extract a user-friendly error message from a Cielo recurrent payment response
   */
  private getCieloErrorMessage(cieloResponse: import('@/infrastructure/cielo/cielo.types').CieloCreateRecurrentPaymentResponse): string {
    const reasonCode = cieloResponse.Payment.RecurrentPayment?.ReasonCode;

    const reasonCodeMessages: Record<number, string> = {
      2: 'Saldo insuficiente. Tente outro cartão.',
      4: 'Cartão vencido. Verifique a validade.',
      7: 'Cartão recusado. Verifique os dados ou tente outro cartão.',
    };

    if (reasonCode !== undefined && reasonCodeMessages[reasonCode]) {
      return reasonCodeMessages[reasonCode];
    }

    if (cieloResponse.Payment.ReturnMessage) {
      return cieloResponse.Payment.ReturnMessage;
    }

    if (cieloResponse.Payment.RecurrentPayment?.ReasonMessage) {
      return cieloResponse.Payment.RecurrentPayment.ReasonMessage;
    }

    return 'Não foi possível processar o pagamento. Verifique os dados do cartão ou tente outro cartão.';
  }

  /**
   * Shared logic for creating a Cielo recurrent subscription
   */
  private async createCieloSubscription(params: {
    userId: string;
    dto: CheckoutRequestDto;
    plan: SubscriptionPlanData;
    authorizeNow: boolean;
    subscriptionStatus: SubscriptionStatus;
    existing: SubscriptionData | null;
    currentPeriodEnd: Date;
    startDate?: string;
    trialUsed?: boolean;
  }): Promise<SubscriptionWithPlan> {
    const { userId, dto, plan, authorizeNow, subscriptionStatus, existing, currentPeriodEnd, startDate, trialUsed } = params;

    // Build Cielo request
    const merchantOrderId = `SUB-${userId}-${Date.now()}`;
    const recurrentPayment: Record<string, unknown> = {
      AuthorizeNow: authorizeNow,
      Interval: 'Monthly',
    };
    if (startDate) {
      recurrentPayment.StartDate = startDate;
    }

    const chargeAmount = plan.promotionalPriceInCents ?? plan.priceInCents;

    const cieloRequest = {
      MerchantOrderId: merchantOrderId,
      Customer: {
        Name: dto.customerName,
        Identity: dto.customerIdentity.replace(/\D/g, ''),
        IdentityType: dto.customerIdentityType,
      },
      Payment: {
        Type: 'CreditCard' as const,
        Amount: chargeAmount,
        Installments: 1,
        SoftDescriptor: 'FelipAI',
        RecurrentPayment: recurrentPayment as { AuthorizeNow: boolean; Interval: 'Monthly'; StartDate?: string },
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

    // Validate response status
    if (authorizeNow) {
      if (
        paymentStatus !== CieloTransactionStatus.Authorized &&
        paymentStatus !== CieloTransactionStatus.Confirmed
      ) {
        throw new SubscriptionError(
          this.getCieloErrorMessage(cieloResponse),
          'checkout_failed',
        );
      }
    } else {
      // AuthorizeNow=false → Scheduled is expected
      if (
        paymentStatus !== CieloTransactionStatus.Authorized &&
        paymentStatus !== CieloTransactionStatus.Confirmed &&
        paymentStatus !== CieloTransactionStatus.Scheduled
      ) {
        this.logger.error(`Scheduled payment failed for user ${userId}, plan ${plan.name}, payment status ${paymentStatus}`);
        throw new SubscriptionError(
          this.getCieloErrorMessage(cieloResponse),
          'checkout_failed',
        );
      }
    }

    // Delete any existing subscription (expired/canceled/trialing) before creating new
    if (existing) {
      await this.subscriptionRepository.delete(existing.id);
    }

    const cardNumber = dto.cardNumber.replace(/\s/g, '');
    const last4 = cardNumber.slice(-4);

    const subscription = await this.subscriptionRepository.create({
      userId,
      planId: plan.id,
      status: subscriptionStatus,
      currentPeriodEnd,
      cieloRecurrentPaymentId: cieloResponse.Payment.RecurrentPayment.RecurrentPaymentId,
      cieloCardToken: cieloResponse.Payment.CreditCard.CardToken ?? undefined,
      cardLastFourDigits: last4,
      cardBrand: dto.brand,
      nextBillingDate: currentPeriodEnd,
      trialUsed,
      promotionalPaymentsRemaining: plan.promotionalMonths ?? 0,
    });

    // Create payment record only when AuthorizeNow=true (immediate charge)
    if (authorizeNow) {
      await this.subscriptionPaymentRepository.create({
        subscriptionId: subscription.id,
        cieloPaymentId: cieloResponse.Payment.PaymentId,
        amountInCents: chargeAmount,
        status: 'paid',
        cieloReturnCode: cieloResponse.Payment.ReturnCode,
        cieloReturnMessage: cieloResponse.Payment.ReturnMessage,
        authorizationCode: cieloResponse.Payment.AuthorizationCode,
        paidAt: new Date(),
      });
    }

    // Get subscription with plan details
    const subscriptionWithPlan = await this.subscriptionRepository.getWithPlanByUserId(userId);
    if (!subscriptionWithPlan) {
      throw new SubscriptionError('Erro ao criar assinatura.', 'subscription_creation_failed');
    }

    return subscriptionWithPlan;
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
    const payment = await this.subscriptionPaymentRepository.getByCieloPaymentId(payload.PaymentId);

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
          const updateData: import('@/infrastructure/persistence/subscription.repository').UpdateSubscriptionInput = {
            status: 'active',
            currentPeriodEnd: newEnd,
            currentPeriodStart: new Date(),
            nextBillingDate: newEnd,
          };

          // Handle promotional payments countdown
          if (subscription.promotionalPaymentsRemaining > 0) {
            const remaining = subscription.promotionalPaymentsRemaining - 1;
            updateData.promotionalPaymentsRemaining = remaining;

            if (remaining === 0 && subscription.cieloRecurrentPaymentId) {
              // Promo ended — switch to full price
              const plan = await this.subscriptionPlanRepository.getPlanById(subscription.planId);
              if (plan) {
                try {
                  await this.cieloService.updateRecurrenceAmount(subscription.cieloRecurrentPaymentId, plan.priceInCents);
                  this.logger.log(`Switched subscription ${subscription.id} to full price ${plan.priceInCents}`);
                } catch (error) {
                  this.logger.error(`Failed to update Cielo amount for subscription ${subscription.id}: ${error}`);
                }
              }
            }
          }

          await this.subscriptionRepository.update(subscription.id, updateData);
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
        const updateData: import('@/infrastructure/persistence/subscription.repository').UpdateSubscriptionInput = {
          status: 'active',
          currentPeriodEnd: newEnd,
          currentPeriodStart: new Date(),
          nextBillingDate: newEnd,
        };

        // Handle promotional payments countdown
        if (subscription.promotionalPaymentsRemaining > 0) {
          const remaining = subscription.promotionalPaymentsRemaining - 1;
          updateData.promotionalPaymentsRemaining = remaining;

          if (remaining === 0 && subscription.cieloRecurrentPaymentId) {
            // Promo ended — switch to full price
            const plan = await this.subscriptionPlanRepository.getPlanById(subscription.planId);
            if (plan) {
              try {
                await this.cieloService.updateRecurrenceAmount(subscription.cieloRecurrentPaymentId, plan.priceInCents);
                this.logger.log(`Switched subscription ${subscription.id} to full price ${plan.priceInCents}`);
              } catch (error) {
                this.logger.error(`Failed to update Cielo amount for subscription ${subscription.id}: ${error}`);
              }
            }
          }
        }

        await this.subscriptionRepository.update(subscription.id, updateData);
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
