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
    plan: {
      id: number;
      name: string;
      displayName: string;
      priceInCents: number;
      groupLimit: number;
      durationDays: number | null;
      features: string[] | null;
    };
    // Card info
    cardLastFourDigits: string | null;
    cardBrand: string | null;
    // Calculated fields
    totalGroupLimit: number;
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
    groupLimit: number;
    features: string[] | null;
  }>;
}

interface TrialResponse {
  subscription: {
    id: number;
    status: string;
    plan: {
      name: string;
      displayName: string;
    };
    currentPeriodEnd: string;
    daysRemaining: number;
  };
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
        plan: {
          id: subscription.plan.id,
          name: subscription.plan.name,
          displayName: subscription.plan.displayName,
          priceInCents: subscription.plan.priceInCents,
          groupLimit: subscription.plan.groupLimit,
          durationDays: subscription.plan.durationDays,
          features: subscription.plan.features,
        },
        cardLastFourDigits: subscription.cardLastFourDigits,
        cardBrand: subscription.cardBrand,
        totalGroupLimit: subscription.plan.groupLimit + subscription.extraGroups,
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
        features: p.features,
      })),
    };

    res.status(HttpStatus.OK).json({
      success: true,
      data: response,
    } satisfies ApiResponse<PlansResponse>);
  }

  /**
   * POST /subscription/trial - Start a free trial
   */
  @Post('trial')
  async startTrial(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    try {
      const result = await this.subscriptionService.startTrial(userId);
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

      const response: TrialResponse = {
        subscription: {
          id: result.subscription.id,
          status: result.subscription.status,
          plan: {
            name: result.subscription.plan.name,
            displayName: result.subscription.plan.displayName,
          },
          currentPeriodEnd: result.subscription.currentPeriodEnd.toISOString(),
          daysRemaining,
        },
      };

      this.logger.log(`Trial started for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        data: response,
      } satisfies ApiResponse<TrialResponse>);
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
      'planId', 'cardNumber', 'holder', 'expirationDate', 'securityCode', 'brand', 'customerName',
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
      const result = await this.subscriptionService.checkout(userId, body as CheckoutRequestDto);
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
            plan: {
              id: result.subscription.plan.id,
              name: result.subscription.plan.name,
              displayName: result.subscription.plan.displayName,
              priceInCents: result.subscription.plan.priceInCents,
              groupLimit: result.subscription.plan.groupLimit,
              durationDays: result.subscription.plan.durationDays,
              features: result.subscription.plan.features,
            },
            totalGroupLimit: result.subscription.plan.groupLimit + result.subscription.extraGroups,
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
}
