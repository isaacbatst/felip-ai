import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { SubscriptionService, SubscriptionError } from '@/infrastructure/subscription/subscription.service';
import { CouponService } from '@/infrastructure/subscription/coupon.service';
import type { CheckoutRequestDto } from '@/infrastructure/cielo/cielo.types';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { SessionGuard } from '@/infrastructure/http/guards/session.guard';

// ============================================================================
// DTOs for request/response
// ============================================================================

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

interface SubscriptionDataResponse {
  subscription: {
    id: number;
    status: string;
    startDate: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextBillingDate: string | null;
    canceledAt: string | null;
    cancelReason: string | null;
    trialUsed: boolean;
    extraGroups: number;
    bonusGroups: number;
    couponDiscountMonthsRemaining: number;
    promotionalPaymentsRemaining: number;
    plan: {
      id: number;
      name: string;
      displayName: string;
      priceInCents: number;
      groupLimit: number | null;
      durationDays: number | null;
      promotionalPriceInCents: number | null;
      promotionalMonths: number | null;
      features: string[] | null;
    };
    // Card info
    cardLastFourDigits: string | null;
    cardBrand: string | null;
    // Calculated fields
    totalGroupLimit: number | null;
    activeGroupsCount: number;
    daysRemaining: number;
  } | null;
}

interface PlansResponse {
  plans: Array<{
    id: number;
    name: string;
    displayName: string;
    priceInCents: number;
    groupLimit: number | null;
    promotionalPriceInCents: number | null;
    promotionalMonths: number | null;
    features: string[] | null;
  }>;
}

/**
 * HTTP Controller for subscription management page
 * Uses cookie-based session auth via SessionGuard
 */
@Controller('subscription')
@UseGuards(SessionGuard)
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly couponService: CouponService,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
  ) {}

  /**
   * GET /subscription - Serve the subscription HTML page
   */
  @Get()
  async getSubscriptionPage(
    @Res() res: Response,
  ): Promise<void> {
    res.sendFile(join(__dirname, '..', '..', 'public', 'assinatura.html'));
  }

  /**
   * GET /subscription/data - Get subscription data
   */
  @Get('data')
  async getSubscriptionData(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const subscription = await this.subscriptionService.getSubscription(userId);

    if (!subscription) {
      res.status(HttpStatus.OK).json({
        success: true,
        data: { subscription: null },
      } satisfies ApiResponse<SubscriptionDataResponse>);
      return;
    }

    // Get active groups count
    const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
    const activeGroupsCount = activeGroups?.length ?? 0;

    // Calculate days remaining
    const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

    const response: SubscriptionDataResponse = {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startDate: subscription.startDate.toISOString(),
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        nextBillingDate: subscription.nextBillingDate?.toISOString() ?? null,
        canceledAt: subscription.canceledAt?.toISOString() ?? null,
        cancelReason: subscription.cancelReason,
        trialUsed: subscription.trialUsed,
        extraGroups: subscription.extraGroups,
        bonusGroups: subscription.bonusGroups,
        couponDiscountMonthsRemaining: subscription.couponDiscountMonthsRemaining,
        promotionalPaymentsRemaining: subscription.promotionalPaymentsRemaining,
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          displayName: subscription.plan.displayName,
          priceInCents: subscription.plan.priceInCents,
          groupLimit: subscription.plan.groupLimit,
          durationDays: subscription.plan.durationDays,
          promotionalPriceInCents: subscription.plan.promotionalPriceInCents,
          promotionalMonths: subscription.plan.promotionalMonths,
          features: subscription.plan.features,
        },
        cardLastFourDigits: subscription.cardLastFourDigits,
        cardBrand: subscription.cardBrand,
        totalGroupLimit: subscription.plan.groupLimit !== null
          ? subscription.plan.groupLimit + subscription.extraGroups + subscription.bonusGroups
          : null,
        activeGroupsCount,
        daysRemaining,
      },
    };

    res.status(HttpStatus.OK).json({
      success: true,
      data: response,
    } satisfies ApiResponse<SubscriptionDataResponse>);
  }

  /**
   * GET /subscription/plans - Get available subscription plans
   */
  @Get('plans')
  async getPlans(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const plans = await this.subscriptionService.getActivePlans();

    const response: PlansResponse = {
      plans: plans.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        priceInCents: p.priceInCents,
        groupLimit: p.groupLimit,
        promotionalPriceInCents: p.promotionalPriceInCents,
        promotionalMonths: p.promotionalMonths,
        features: p.features,
      })),
    };

    res.status(HttpStatus.OK).json({
      success: true,
      data: response,
    } satisfies ApiResponse<PlansResponse>);
  }

  /**
   * GET /subscription/payments - Get payment history
   */
  @Get('payments')
  async getPaymentHistory(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const payments = await this.subscriptionService.getPaymentHistory(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        payments: payments.map(p => ({
          id: p.id,
          amountInCents: p.amountInCents,
          status: p.status,
          paidAt: p.paidAt?.toISOString() ?? null,
          failedAt: p.failedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      },
    } satisfies ApiResponse);
  }

  /**
   * POST /subscription/trial - Start a trial with card info via Cielo
   */
  @Post('trial')
  async startTrial(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as Partial<CheckoutRequestDto>;

    // Validate required fields (same as checkout)
    const requiredFields: (keyof CheckoutRequestDto)[] = [
      'planId', 'cardNumber', 'holder', 'expirationDate', 'securityCode', 'brand', 'customerName', 'customerIdentity', 'customerIdentityType',
    ];
    const missingFields = requiredFields.filter((f) => !body[f]);
    if (missingFields.length > 0) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
        code: 'missing_fields',
      } satisfies ApiResponse);
      return;
    }

    try {
      const dto = body as CheckoutRequestDto;
      const result = await this.subscriptionService.startTrial(userId, dto, dto.couponCode);
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsCount = activeGroups?.length ?? 0;

      this.logger.log(`Trial started for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: {
            id: result.subscription.id,
            status: result.subscription.status,
            startDate: result.subscription.startDate.toISOString(),
            currentPeriodStart: result.subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: result.subscription.currentPeriodEnd.toISOString(),
            nextBillingDate: result.subscription.nextBillingDate?.toISOString() ?? null,
            canceledAt: null,
            cancelReason: null,
            trialUsed: result.subscription.trialUsed,
            extraGroups: result.subscription.extraGroups,
            bonusGroups: result.subscription.bonusGroups,
            couponDiscountMonthsRemaining: result.subscription.couponDiscountMonthsRemaining,
            promotionalPaymentsRemaining: result.subscription.promotionalPaymentsRemaining,
            plan: {
              id: result.subscription.plan.id,
              name: result.subscription.plan.name,
              displayName: result.subscription.plan.displayName,
              priceInCents: result.subscription.plan.priceInCents,
              groupLimit: result.subscription.plan.groupLimit,
              durationDays: result.subscription.plan.durationDays,
              promotionalPriceInCents: result.subscription.plan.promotionalPriceInCents,
              promotionalMonths: result.subscription.plan.promotionalMonths,
              features: result.subscription.plan.features,
            },
            totalGroupLimit: result.subscription.plan.groupLimit !== null
              ? result.subscription.plan.groupLimit + result.subscription.extraGroups + result.subscription.bonusGroups
              : null,
            activeGroupsCount,
            daysRemaining,
            cardLastFourDigits: result.subscription.cardLastFourDigits,
            cardBrand: result.subscription.cardBrand,
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error starting trial', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao iniciar período de teste. Tente novamente.',
        code: 'internal_error',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/update-payment - Update payment method
   */
  @Post('update-payment')
  async updatePaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as Partial<CheckoutRequestDto>;

    const requiredFields: (keyof CheckoutRequestDto)[] = [
      'cardNumber', 'holder', 'expirationDate', 'securityCode', 'brand', 'customerName', 'customerIdentity', 'customerIdentityType',
    ];
    const missingFields = requiredFields.filter((f) => !body[f]);
    if (missingFields.length > 0) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
        code: 'missing_fields',
      } satisfies ApiResponse);
      return;
    }

    try {
      const updated = await this.subscriptionService.updatePaymentMethod(userId, body as CheckoutRequestDto);

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          cardLastFourDigits: updated.cardLastFourDigits,
          cardBrand: updated.cardBrand,
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error updating payment method', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao atualizar forma de pagamento. Tente novamente.',
        code: 'update_payment_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/validate-coupon - Validate a coupon and return preview
   */
  @Post('validate-coupon')
  async validateCoupon(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as { couponCode?: string; planId?: number };

    if (!body.couponCode || !body.planId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'couponCode e planId são obrigatórios.',
        code: 'missing_fields',
      } satisfies ApiResponse);
      return;
    }

    try {
      const coupon = await this.couponService.validateCoupon(body.couponCode, userId, body.planId);

      // Get plan to calculate preview
      const plans = await this.subscriptionService.getActivePlans();
      const plan = plans.find(p => p.id === body.planId);
      if (!plan) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Plano não encontrado.',
          code: 'plan_not_found',
        } satisfies ApiResponse);
        return;
      }

      // Calculate discounted price preview
      const originalPrice = plan.promotionalPriceInCents ?? plan.priceInCents;
      const discountedPrice = coupon.discountType ? this.couponService.applyPlanDiscount(originalPrice, coupon) : originalPrice;
      const extraGroupPrice = this.couponService.getExtraGroupPrice(coupon);

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          coupon: {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountDurationMonths: coupon.discountDurationMonths,
            extraGroupPriceInCents: coupon.extraGroupPriceInCents,
            bonusGroups: coupon.bonusGroups,
          },
          preview: {
            originalPriceInCents: originalPrice,
            discountedPriceInCents: discountedPrice,
            extraGroupPriceInCents: extraGroupPrice,
            bonusGroups: coupon.bonusGroups,
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error validating coupon', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao validar cupom. Tente novamente.',
        code: 'coupon_validation_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/cancel - Cancel trial or subscription
   */
  @Post('cancel')
  async cancelSubscription(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    try {
      await this.subscriptionService.cancelSubscription(userId);

      this.logger.log(`Subscription canceled for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error canceling subscription', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao cancelar assinatura. Tente novamente.',
        code: 'cancel_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/change-plan - Change subscription plan
   */
  @Post('change-plan')
  async changePlan(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as { planId?: number };

    if (!body.planId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'planId é obrigatório.',
        code: 'missing_fields',
      } satisfies ApiResponse);
      return;
    }

    try {
      const updated = await this.subscriptionService.changePlan(userId, body.planId);
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsCount = activeGroups?.length ?? 0;
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: {
            id: updated.id,
            status: updated.status,
            startDate: updated.startDate.toISOString(),
            currentPeriodStart: updated.currentPeriodStart.toISOString(),
            currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
            nextBillingDate: updated.nextBillingDate?.toISOString() ?? null,
            canceledAt: updated.canceledAt?.toISOString() ?? null,
            cancelReason: updated.cancelReason,
            trialUsed: updated.trialUsed,
            extraGroups: updated.extraGroups,
            bonusGroups: updated.bonusGroups,
            couponDiscountMonthsRemaining: updated.couponDiscountMonthsRemaining,
            promotionalPaymentsRemaining: updated.promotionalPaymentsRemaining,
            plan: {
              id: updated.plan.id,
              name: updated.plan.name,
              displayName: updated.plan.displayName,
              priceInCents: updated.plan.priceInCents,
              groupLimit: updated.plan.groupLimit,
              durationDays: updated.plan.durationDays,
              promotionalPriceInCents: updated.plan.promotionalPriceInCents,
              promotionalMonths: updated.plan.promotionalMonths,
              features: updated.plan.features,
            },
            totalGroupLimit: updated.plan.groupLimit !== null
              ? updated.plan.groupLimit + updated.extraGroups + updated.bonusGroups
              : null,
            activeGroupsCount,
            daysRemaining,
            cardLastFourDigits: updated.cardLastFourDigits,
            cardBrand: updated.cardBrand,
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error changing plan', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao trocar de plano. Tente novamente.',
        code: 'plan_change_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/addons/groups - Purchase extra group slots
   */
  @Post('addons/groups')
  async purchaseExtraGroups(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as { count?: number };

    if (!body.count || body.count < 1) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Quantidade inválida.',
        code: 'invalid_count',
      } satisfies ApiResponse);
      return;
    }

    try {
      const updated = await this.subscriptionService.purchaseExtraGroups(userId, body.count);
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsCount = activeGroups?.length ?? 0;
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: this.formatSubscriptionResponse(updated, activeGroupsCount, daysRemaining),
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error purchasing extra groups', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao comprar grupos extras. Tente novamente.',
        code: 'extra_groups_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/addons/groups/remove - Remove extra group slots
   */
  @Post('addons/groups/remove')
  async removeExtraGroups(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as { count?: number };

    if (!body.count || body.count < 1) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Quantidade inválida.',
        code: 'invalid_count',
      } satisfies ApiResponse);
      return;
    }

    try {
      const updated = await this.subscriptionService.removeExtraGroups(userId, body.count);
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsCount = activeGroups?.length ?? 0;
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: this.formatSubscriptionResponse(updated, activeGroupsCount, daysRemaining),
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error removing extra groups', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao remover grupos extras. Tente novamente.',
        code: 'extra_groups_failed',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /subscription/checkout - Subscribe to a paid plan via Cielo
   */
  @Post('checkout')
  async checkout(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const body = req.body as Partial<CheckoutRequestDto>;

    // Validate required fields
    const requiredFields: (keyof CheckoutRequestDto)[] = [
      'planId', 'cardNumber', 'holder', 'expirationDate', 'securityCode', 'brand', 'customerName', 'customerIdentity', 'customerIdentityType',
    ];
    const missingFields = requiredFields.filter((f) => !body[f]);
    if (missingFields.length > 0) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `Campos obrigatórios faltando: ${missingFields.join(', ')}`,
        code: 'missing_fields',
      } satisfies ApiResponse);
      return;
    }

    try {
      const checkoutDto = body as CheckoutRequestDto;
      const result = await this.subscriptionService.checkout(userId, checkoutDto, checkoutDto.couponCode);
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsCount = activeGroups?.length ?? 0;

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: {
            id: result.subscription.id,
            status: result.subscription.status,
            startDate: result.subscription.startDate.toISOString(),
            currentPeriodStart: result.subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: result.subscription.currentPeriodEnd.toISOString(),
            nextBillingDate: result.subscription.nextBillingDate?.toISOString() ?? null,
            canceledAt: null,
            cancelReason: null,
            trialUsed: result.subscription.trialUsed,
            extraGroups: result.subscription.extraGroups,
            bonusGroups: result.subscription.bonusGroups,
            couponDiscountMonthsRemaining: result.subscription.couponDiscountMonthsRemaining,
            promotionalPaymentsRemaining: result.subscription.promotionalPaymentsRemaining,
            plan: {
              id: result.subscription.plan.id,
              name: result.subscription.plan.name,
              displayName: result.subscription.plan.displayName,
              priceInCents: result.subscription.plan.priceInCents,
              groupLimit: result.subscription.plan.groupLimit,
              durationDays: result.subscription.plan.durationDays,
              promotionalPriceInCents: result.subscription.plan.promotionalPriceInCents,
              promotionalMonths: result.subscription.plan.promotionalMonths,
              features: result.subscription.plan.features,
            },
            totalGroupLimit: result.subscription.plan.groupLimit !== null
              ? result.subscription.plan.groupLimit + result.subscription.extraGroups + result.subscription.bonusGroups
              : null,
            activeGroupsCount,
            daysRemaining,
            cardLastFourDigits: result.subscription.cardLastFourDigits,
            cardBrand: result.subscription.cardBrand,
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof SubscriptionError) {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: error.message,
          code: error.code,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error during checkout', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao processar pagamento. Tente novamente.',
        code: 'checkout_failed',
      } satisfies ApiResponse);
    }
  }

  private formatSubscriptionResponse(
    sub: import('@/infrastructure/persistence/subscription.repository').SubscriptionWithPlan,
    activeGroupsCount: number,
    daysRemaining: number,
  ): SubscriptionDataResponse['subscription'] {
    return {
      id: sub.id,
      status: sub.status,
      startDate: sub.startDate.toISOString(),
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      nextBillingDate: sub.nextBillingDate?.toISOString() ?? null,
      canceledAt: sub.canceledAt?.toISOString() ?? null,
      cancelReason: sub.cancelReason,
      trialUsed: sub.trialUsed,
      extraGroups: sub.extraGroups,
      bonusGroups: sub.bonusGroups,
      couponDiscountMonthsRemaining: sub.couponDiscountMonthsRemaining,
      promotionalPaymentsRemaining: sub.promotionalPaymentsRemaining,
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        displayName: sub.plan.displayName,
        priceInCents: sub.plan.priceInCents,
        groupLimit: sub.plan.groupLimit,
        durationDays: sub.plan.durationDays,
        promotionalPriceInCents: sub.plan.promotionalPriceInCents,
        promotionalMonths: sub.plan.promotionalMonths,
        features: sub.plan.features,
      },
      cardLastFourDigits: sub.cardLastFourDigits,
      cardBrand: sub.cardBrand,
      totalGroupLimit: sub.plan.groupLimit !== null
        ? sub.plan.groupLimit + sub.extraGroups + sub.bonusGroups
        : null,
      activeGroupsCount,
      daysRemaining,
    };
  }
}
