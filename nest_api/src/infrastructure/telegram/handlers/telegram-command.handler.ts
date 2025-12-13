import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { QuoteFormatterService } from '../../../domain/services/quote-formatter.service';
import { PriceTableProvider } from 'src/domain/interfaces/price-table-provider.interface';
import { ConversationStateService, ConversationState } from '../conversation-state.service';
import { TelegramUserClient } from '../telegram-user-client';

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
    private readonly telegramUserClient: TelegramUserClient,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    const _userId = ctx.from?.id;
    const _chatId = ctx.chat?.id;

    // Revalida o cache antes de mostrar a tabela
    const priceTableResult = await this.priceTableCache.getPriceTable();
    const priceTablesFormatted = this.quoteFormatter.formatPriceTablesByProvider(priceTableResult.priceTables);

    const welcomeMessage = `📊 Tabelas de Preços por Provedor (1 CPF):${priceTablesFormatted}`;

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

  async handleGrupos(ctx: Context): Promise<void> {
    const client = this.telegramUserClient.getClient();
    if (!client) {
      await ctx.reply('❌ Cliente Telegram não está disponível. Por favor, faça login primeiro.');
      return;
    }

    try {
      // Get all chats
      const chatsResult = await client.invoke({
        _: 'getChats',
        chat_list: {
          _: 'chatListMain',
        },
        limit: 100,
      });

      if (
        !chatsResult ||
        typeof chatsResult !== 'object' ||
        !('chat_ids' in chatsResult) ||
        !Array.isArray(chatsResult.chat_ids)
      ) {
        await ctx.reply('❌ Não foi possível obter a lista de grupos.');
        return;
      }

      const chatIds = chatsResult.chat_ids as number[];
      const grupos: Array<{ id: number; title: string }> = [];

      // Fetch details for each chat to filter groups
      for (const chatId of chatIds) {
        try {
          const chat = await client.invoke({
            _: 'getChat',
            chat_id: chatId,
          });

          if (
            chat &&
            typeof chat === 'object' &&
            'type' in chat &&
            chat.type &&
            typeof chat.type === 'object' &&
            '_' in chat.type
          ) {
            const chatType = (chat.type as { _: string })._;
            // Filter for groups and supergroups
            if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
              const title =
                'title' in chat && typeof chat.title === 'string' ? chat.title : 'Sem título';
              grupos.push({ id: chatId, title });
            }
          }
        } catch (error) {
          console.error(`[ERROR] Error fetching chat ${chatId}:`, error);
        }
      }

      if (grupos.length === 0) {
        await ctx.reply('📭 Você não está em nenhum grupo.');
        return;
      }

      // Format the response
      let message = `📋 Grupos que você está participando (${grupos.length}):\n\n`;
      grupos.forEach((grupo, index) => {
        message += `${index + 1}. ${grupo.title}\n   ID: ${grupo.id}\n\n`;
      });

      // Telegram has a message length limit, so split if needed
      const maxLength = 4096;
      if (message.length > maxLength) {
        const chunks: string[] = [];
        let currentChunk = `📋 Grupos que você está participando (${grupos.length}):\n\n`;
        let count = 0;

        for (const grupo of grupos) {
          const grupoLine = `${count + 1}. ${grupo.title}\n   ID: ${grupo.id}\n\n`;
          if (currentChunk.length + grupoLine.length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
          currentChunk += grupoLine;
          count++;
        }
        if (currentChunk) {
          chunks.push(currentChunk);
        }

        // Send all chunks
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.reply(message);
      }
    } catch (error) {
      console.error('[ERROR] Error fetching groups:', error);
      await ctx.reply('❌ Erro ao buscar lista de grupos. Por favor, tente novamente mais tarde.');
    }
  }

  async handleLogout(ctx: Context): Promise<void> {
    const client = this.telegramUserClient.getClient();
    if (!client) {
      await ctx.reply('❌ Cliente Telegram não está disponível ou já foi desconectado.');
      return;
    }

    try {
      // Check if user is logged in before attempting logout
      const authState = await client.invoke({
        _: 'getAuthorizationState',
      });

      if (
        typeof authState === 'object' &&
        authState !== null &&
        '_' in authState &&
        (authState as { _: string })._ !== 'authorizationStateReady'
      ) {
        await ctx.reply('❌ Você não está logado no momento.');
        return;
      }

      // Perform logout
      await client.invoke({
        _: 'logOut',
      });

      await ctx.reply('✅ Logout realizado com sucesso! Você foi desconectado do cliente Telegram.');
    } catch (error) {
      console.error('[ERROR] Error during logout:', error);
      await ctx.reply('❌ Erro ao realizar logout. Por favor, tente novamente mais tarde.');
    }
  }
}

