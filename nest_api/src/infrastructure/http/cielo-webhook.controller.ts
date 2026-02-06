import {
  Controller,
  Post,
  Req,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '@/config/app.config';
import { CieloWebhookEventRepository } from '@/infrastructure/persistence/cielo-webhook-event.repository';
import { SubscriptionService } from '@/infrastructure/subscription/subscription.service';
import type { CieloWebhookPayload } from '@/infrastructure/cielo/cielo.types';

@Controller('webhooks')
export class CieloWebhookController {
  private readonly logger = new Logger(CieloWebhookController.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly webhookEventRepository: CieloWebhookEventRepository,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('cielo')
  async handleCieloWebhook(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const secret = req.headers['x-cielo-webhook-secret'] as string | undefined;
    const expectedSecret = this.appConfig.getCieloWebhookSecret();

    if (!expectedSecret || secret !== expectedSecret) {
      this.logger.warn('Invalid webhook secret');
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'Invalid secret' });
      return;
    }

    const payload = req.body as CieloWebhookPayload;

    // Store raw event before processing
    const event = await this.webhookEventRepository.create({
      paymentId: payload.PaymentId,
      recurrentPaymentId: payload.RecurrentPaymentId,
      changeType: payload.ChangeType,
      rawPayload: payload,
    });

    // Respond 200 immediately
    res.status(HttpStatus.OK).json({ received: true });

    // Process asynchronously after response
    try {
      await this.subscriptionService.processWebhookEvent(payload);
      await this.webhookEventRepository.markProcessed(event.id);
      this.logger.log(`Processed webhook event ${event.id} (changeType=${payload.ChangeType})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing webhook event ${event.id}: ${errorMessage}`);
      await this.webhookEventRepository.markError(event.id, errorMessage);
    }
  }
}
