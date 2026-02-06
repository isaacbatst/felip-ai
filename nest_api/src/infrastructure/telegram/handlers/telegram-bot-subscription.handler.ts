import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'grammy';
import { SubscriptionService } from '@/infrastructure/subscription/subscription.service';
import { AppConfigService } from '@/config/app.config';

@Injectable()
export class TelegramBotSubscriptionHandler {
  private readonly logger = new Logger(TelegramBotSubscriptionHandler.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly appConfig: AppConfigService,
  ) {}

  async handleAssinar(ctx: Context): Promise<void> {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) {
      await ctx.reply('Não foi possível identificar seu usuário.');
      return;
    }

    try {
      const plans = await this.subscriptionService.getActivePlans();
      const baseUrl = this.appConfig.getAppBaseUrl();

      let message = 'Planos disponíveis:\n\n';

      for (const plan of plans) {
        const priceFormatted = (plan.priceInCents / 100).toFixed(2).replace('.', ',');
        message += `${plan.displayName} - R$ ${priceFormatted}/mês\n`;
        message += `  ${plan.groupLimit} grupos ativos\n\n`;
      }

      message += `Assine pelo link:\n${baseUrl}/subscription`;

      await ctx.reply(message);
    } catch (error) {
      this.logger.error('Error handling /assinar', error);
      await ctx.reply('Erro ao carregar planos. Tente novamente mais tarde.');
    }
  }

  async handleAssinatura(ctx: Context): Promise<void> {
    const telegramUserId = ctx.from?.id;
    if (!telegramUserId) {
      await ctx.reply('Não foi possível identificar seu usuário.');
      return;
    }

    try {
      const userId = String(telegramUserId);
      const subscription = await this.subscriptionService.getSubscription(userId);
      const baseUrl = this.appConfig.getAppBaseUrl();

      if (!subscription) {
        await ctx.reply(
          'Você não possui uma assinatura ativa.\n\n' +
          `Assine pelo link:\n${baseUrl}/subscription`,
        );
        return;
      }

      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;
      const statusLabels: Record<string, string> = {
        active: 'Ativo',
        trialing: 'Período de Teste',
        past_due: 'Pagamento Pendente',
        canceled: 'Cancelado',
        expired: 'Expirado',
      };

      let message = `Sua assinatura:\n\n`;
      message += `Plano: ${subscription.plan.displayName}\n`;
      message += `Status: ${statusLabels[subscription.status] || subscription.status}\n`;
      message += `Dias restantes: ${daysRemaining}\n\n`;
      message += `Gerencie pelo link:\n${baseUrl}/subscription`;

      await ctx.reply(message);
    } catch (error) {
      this.logger.error('Error handling /assinatura', error);
      await ctx.reply('Erro ao carregar dados da assinatura. Tente novamente mais tarde.');
    }
  }
}
