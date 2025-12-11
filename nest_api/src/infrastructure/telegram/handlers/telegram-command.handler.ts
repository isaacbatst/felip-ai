import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { QuoteFormatterService } from '../../../domain/services/quote-formatter.service';
import { PriceTableProvider } from 'src/domain/interfaces/price-table-provider.interface';
import { ConversationStateService, ConversationState } from '../conversation-state.service';

/**
 * Handler responsável por processar comandos do Telegram
 * Single Responsibility: apenas processamento de comandos
 */
@Injectable()
export class TelegramCommandHandler {
  constructor(
    private readonly priceTableCache: PriceTableProvider,
    private readonly quoteFormatter: QuoteFormatterService,
    private readonly conversationState: ConversationStateService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    const _userId = ctx.from?.id;
    const _chatId = ctx.chat?.id;

    // Revalida o cache antes de mostrar a tabela
    const priceTableResult = await this.priceTableCache.getPriceTable();
    const priceTableFormatted = this.quoteFormatter.formatPriceTableV2(priceTableResult.priceTable);

    const welcomeMessage = `📊 Tabela de Preços (1 CPF):${priceTableFormatted}`;

    await ctx.reply(welcomeMessage);
  }

  async handleLogin(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('❌ Não foi possível identificar seu usuário.');
      return;
    }

    // Set conversation state to waiting for phone number
    this.conversationState.setState(userId, ConversationState.WAITING_PHONE_NUMBER);

    const message =
      '📱 Por favor, envie seu número de telefone no formato internacional.\n\n' +
      'Exemplo: +5511999999999\n\n' +
      'O número deve começar com + seguido do código do país.';

    await ctx.reply(message);
  }
}
