import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { AuthCodeService } from '../auth-code.service';
import { ConversationStateService } from '../conversation-state.service';

/**
 * Handler responsável por processar entrada de código de autenticação durante o fluxo de login
 * Single Responsibility: apenas processamento de código de autenticação
 * Composition: usa services para validar e fornecer código
 */
@Injectable()
export class TelegramAuthCodeHandler {
  constructor(
    private readonly conversationState: ConversationStateService,
    private readonly authCodeService: AuthCodeService,
  ) {}

  async handleAuthCodeInput(ctx: Context, authCode: string, userId: number): Promise<void> {
    // Normalize the code (remove spaces, dashes, etc.)
    const normalizedCode = authCode.trim().replace(/[\s-]/g, '');

    // Validate code format (should be numeric, typically 5 digits)
    if (!/^\d+$/.test(normalizedCode)) {
      await ctx.reply(
        '❌ Formato inválido. Por favor, envie apenas números.\n\n' +
          'Exemplo: 12345',
      );
      return;
    }

    // Check if there's a pending auth code request
    if (!this.authCodeService.hasPendingAuthCode(userId)) {
      await ctx.reply(
        '❌ Não há uma solicitação de código de autenticação pendente.\n\n' +
          'Por favor, inicie o processo de login novamente.',
      );
      this.conversationState.clearState(userId);
      return;
    }

    // Provide the code to the login handler
    const provided = this.authCodeService.provideAuthCode(userId, normalizedCode);

    if (provided) {
      await ctx.reply('✅ Código recebido! Processando login...');
    } else {
      await ctx.reply(
        '❌ Erro ao processar código. Por favor, tente novamente.',
      );
      this.conversationState.clearState(userId);
    }
  }
}

