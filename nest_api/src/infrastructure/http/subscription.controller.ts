import {
  Controller,
  Get,
  Post,
  Param,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';
import { SubscriptionTokenRepository } from '@/infrastructure/persistence/subscription-token.repository';
import { SubscriptionService, SubscriptionError } from '@/infrastructure/subscription/subscription.service';
import { SubscriptionPlanData } from '@/infrastructure/persistence/subscription-plan.repository';
import { SubscriptionWithPlan } from '@/infrastructure/persistence/subscription.repository';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';

// ============================================================================
// DTOs for request/response
// ============================================================================

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
 * Handles token validation and subscription operations
 */
@Controller('subscription')
export class SubscriptionController {
  private readonly logger = new Logger(SubscriptionController.name);

  constructor(
    private readonly subscriptionTokenRepository: SubscriptionTokenRepository,
    private readonly subscriptionService: SubscriptionService,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
  ) {}

  /**
   * GET /subscription/:token - Serve the subscription HTML page
   * Validates the token and serves the page if valid
   */
  @Get(':token')
  async getSubscriptionPage(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Subscription page requested for token: ${token.substring(0, 8)}...`);

    const validation = await this.subscriptionTokenRepository.validateToken(token);

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        not_found: 'Link inválido ou expirado.',
        expired: 'Este link expirou. Por favor, solicite um novo link no bot ou dashboard.',
      };

      const errorMessage = validation.error ? errorMessages[validation.error] : 'Erro desconhecido.';
      res.status(this.getHttpStatusForError(validation.error)).send(this.getErrorHtml(errorMessage));
      return;
    }

    // Serve the subscription page
    res.sendFile(join(__dirname, '..', '..', 'public', 'assinatura.html'));
  }

  /**
   * GET /subscription/:token/data - Get subscription data
   */
  @Get(':token/data')
  async getSubscriptionData(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * GET /subscription/:token/plans - Get available subscription plans
   */
  @Get(':token/plans')
  async getPlans(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * POST /subscription/:token/trial - Start a free trial
   */
  @Post(':token/trial')
  async startTrial(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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

  // ============================================================================
  // Helper methods
  // ============================================================================

  /**
   * Validate token and get user ID, or send error response
   */
  private async validateAndGetUserId(token: string, res: Response): Promise<string | null> {
    const validation = await this.subscriptionTokenRepository.validateToken(token);

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        not_found: 'token_not_found',
        expired: 'token_expired',
      };

      res.status(this.getHttpStatusForError(validation.error)).json({
        success: false,
        error: validation.error ? errorMessages[validation.error] : 'unknown_error',
      } satisfies ApiResponse);
      return null;
    }

    return validation.token?.userId ?? null;
  }

  /**
   * Map error type to HTTP status code
   */
  private getHttpStatusForError(error?: string): HttpStatus {
    switch (error) {
      case 'not_found':
        return HttpStatus.NOT_FOUND;
      case 'expired':
        return HttpStatus.GONE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  /**
   * Generate error HTML page
   */
  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erro - Assinatura</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { color: #e74c3c; font-size: 24px; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Erro</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
