import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { ConversationStateService } from '../conversation-state.service';
import { TelegramLoginOrchestratorService } from '../telegram-login-orchestrator.service';

/**
 * Handler responsável por processar entrada de número de telefone durante o fluxo de login
 * Single Responsibility: apenas processamento de número de telefone
 * Composition: usa services para validar e realizar login
 */
@Injectable()
export class TelegramPhoneNumberHandler {
  constructor(
    private readonly conversationState: ConversationStateService,
    private readonly loginOrchestrator: TelegramLoginOrchestratorService,
  ) {}

  async handlePhoneNumberInput(
    ctx: Context,
    phoneNumber: string,
    userId: number,
  ): Promise<void> {
    // Validate phone number format (should start with +)
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone.startsWith('+')) {
      await ctx.reply(
        '❌ Formato inválido. Por favor, envie o número no formato internacional começando com +.\n\n' +
          'Exemplo: +5511999999999',
      );
      return;
    }

    // Check if phone number is in whitelist
    if (!this.loginOrchestrator.isPhoneNumberAllowed(normalizedPhone)) {
      this.conversationState.clearState(userId);
      await ctx.reply(
        '❌ Seu número não está autorizado.\n\n' +
          'Por favor, entre em contato com o suporte para habilitar seu número.',
      );
      return;
    }

    // Clear conversation state
    this.conversationState.clearState(userId);

    // Inform user that login is starting
    await ctx.reply('🔄 Iniciando processo de login...');

    try {
      // Perform login
      const userInfo = await this.loginOrchestrator.performLogin(normalizedPhone);

      // Send success message
      const successMessage =
        '✅ Login realizado com sucesso!\n\n' +
        `📋 Informações da conta:\n` +
        `• ID: ${userInfo.id}\n` +
        (userInfo.first_name ? `• Nome: ${userInfo.first_name}` : '') +
        (userInfo.last_name ? ` ${userInfo.last_name}` : '') +
        (userInfo.username ? `\n• Username: @${userInfo.username}` : '') +
        (userInfo.phone_number ? `\n• Telefone: ${userInfo.phone_number}` : '');

      await ctx.reply(successMessage);
    } catch (error) {
      console.error('[ERROR] Login failed:', error);
      await ctx.reply(
        '❌ Erro ao realizar login. Por favor, tente novamente mais tarde ou entre em contato com o suporte.',
      );
    }
  }
}

