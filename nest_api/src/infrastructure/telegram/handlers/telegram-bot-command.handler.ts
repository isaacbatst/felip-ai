import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { QuoteFormatterService } from '../../../domain/services/quote-formatter.service';
import { PriceTableProvider } from 'src/domain/interfaces/price-table-provider.interface';
import { ConversationStateService, ConversationState } from '../conversation-state.service';
import { TelegramUserClient } from '../telegram-user-client';
import { ActiveGroupsRepository } from 'src/infrastructure/persistence/active-groups.repository';

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
    private readonly activeGroupsRepository: ActiveGroupsRepository,
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
    try {
      // Get all chats
      const chatsResult = await this.telegramUserClient.getChats(
        {
          _: 'chatListMain',
        },
        100,
      );

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
          const chat = await this.telegramUserClient.getChat(chatId);

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
        message += `${index + 1}. ${grupo.title}\`${grupo.id}\`\n\n`;
      });

      // Telegram has a message length limit, so split if needed
      const maxLength = 4096;
      if (message.length > maxLength) {
        const chunks: string[] = [];
        let currentChunk = `📋 Grupos que você está participando (${grupos.length}):\n\n`;
        let count = 0;

        for (const grupo of grupos) {
          const grupoLine = `${count + 1}. ${grupo.title}\`${grupo.id}\`\n\n`;
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
          await ctx.reply(chunk, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('[ERROR] Error fetching groups:', error);
      if (error instanceof Error && error.message === 'Client not initialized') {
        await ctx.reply('❌ Cliente Telegram não está disponível. Por favor, faça login primeiro.');
      } else {
        await ctx.reply('❌ Erro ao buscar lista de grupos. Por favor, tente novamente mais tarde.');
      }
    }
  }

  async handleLogout(ctx: Context): Promise<void> {
    try {
      // Check if user is logged in before attempting logout
      const authState = await this.telegramUserClient.getAuthorizationState();

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
      await this.telegramUserClient.logOut();

      await ctx.reply('✅ Logout realizado com sucesso! Você foi desconectado do cliente Telegram.');
    } catch (error) {
      console.error('[ERROR] Error during logout:', error);
      if (error instanceof Error && error.message === 'Client not initialized') {
        await ctx.reply('❌ Cliente Telegram não está disponível ou já foi desconectado.');
      } else {
        await ctx.reply('❌ Erro ao realizar logout. Por favor, tente novamente mais tarde.');
      }
    }
  }

  async handleAtivar(ctx: Context): Promise<void> {
    try {
      // Get logged in user ID from Telegram client
      const loggedInUserId = await this.telegramUserClient.getUserId();
      if (!loggedInUserId) {
        await ctx.reply('❌ Cliente Telegram não está logado. Por favor, faça login primeiro.');
        return;
      }

      const commandText = ctx.message?.text;
      if (!commandText) {
        await ctx.reply('❌ Comando inválido.');
        return;
      }

      // Extract group IDs from command: /ativar 123456 789012
      const parts = commandText.split(' ').slice(1); // Remove '/ativar'
      
      if (parts.length === 0) {
        await ctx.reply(
          '📝 Uso: /ativar <id1> [id2] [id3] ...\n\n' +
          'Exemplo: /ativar 123456789 -1234567890\n\n' +
          'Forneça pelo menos um ID de grupo para ativar.'
        );
        return;
      }

      const groupIds: number[] = [];
      const invalidIds: string[] = [];

      for (const part of parts) {
        const parsedId = Number.parseInt(part.trim(), 10);
        if (Number.isNaN(parsedId)) {
          invalidIds.push(part);
        } else {
          groupIds.push(parsedId);
        }
      }

      if (invalidIds.length > 0) {
        await ctx.reply(
          `❌ IDs inválidos: ${invalidIds.join(', ')}\n\n` +
          'Por favor, forneça apenas números válidos.'
        );
        return;
      }

      if (groupIds.length === 0) {
        await ctx.reply('❌ Nenhum ID válido fornecido.');
        return;
      }

      // Validate groups exist in Telegram client before saving
      const validatedGroups: Array<{ id: number; title: string }> = [];
      const notFoundIds: number[] = [];
      const invalidGroupIds: number[] = [];

      for (const groupId of groupIds) {
        try {
          const chat = await this.telegramUserClient.getChat(groupId);
          
          if (
            chat &&
            typeof chat === 'object' &&
            'type' in chat &&
            chat.type &&
            typeof chat.type === 'object' &&
            '_' in chat.type
          ) {
            const chatType = (chat.type as { _: string })._;
            // Only allow groups and supergroups
            if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
              const title =
                'title' in chat && typeof chat.title === 'string' ? chat.title : 'Sem título';
              validatedGroups.push({ id: groupId, title });
            } else {
              invalidGroupIds.push(groupId);
            }
          } else {
            notFoundIds.push(groupId);
          }
        } catch (error) {
          console.error(`[ERROR] Error fetching chat ${groupId}:`, error);
          notFoundIds.push(groupId);
        }
      }

      // If no valid groups found, return error
      if (validatedGroups.length === 0) {
        let errorMessage = '❌ Nenhum grupo válido encontrado.\n\n';
        if (notFoundIds.length > 0) {
          errorMessage += `Grupos não encontrados: \`${notFoundIds.join(', ')}\`\n\n`;
        }
        if (invalidGroupIds.length > 0) {
          errorMessage += `IDs não são grupos: \`${invalidGroupIds.join(', ')}\`\n\n`;
        }
        errorMessage += 'Verifique se os IDs estão corretos e se você tem acesso aos grupos.';
        errorMessage += 'Use o comando /grupos para ver a lista de grupos que você está participando.';
        await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
        return;
      }

      // Get current active groups using logged in user ID
      const currentActiveGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserId.toString());
      const activeGroupsSet = new Set(currentActiveGroups || []);

      // Add new validated group IDs
      const newGroups: Array<{ id: number; title: string }> = [];
      const alreadyActiveGroups: Array<{ id: number; title: string }> = [];

      for (const grupo of validatedGroups) {
        if (!activeGroupsSet.has(grupo.id)) {
          activeGroupsSet.add(grupo.id);
          newGroups.push(grupo);
        } else {
          alreadyActiveGroups.push(grupo);
        }
      }

      // Save updated active groups using logged in user ID
      const updatedActiveGroups = Array.from(activeGroupsSet);
      await this.activeGroupsRepository.setActiveGroups(loggedInUserId.toString(), updatedActiveGroups);

      // Build response message
      let message = '';
      
      if (newGroups.length > 0) {
        message = `✅ ${newGroups.length} grupo(s) ativado(s) com sucesso!\n\n`;
        message += `📋 Grupos ativos:\n\n`;
        newGroups.forEach((grupo, index) => {
          message += `${index + 1}. ${grupo.title}\n\`${grupo.id}\`\n\n`;
        });
        message += `Total de grupos ativos: ${updatedActiveGroups.length}`;
      } else {
        message = `ℹ️ Todos os grupos fornecidos já estavam ativos.\n\n`;
        message += `📋 Grupos já ativos:\n\n`;
        alreadyActiveGroups.forEach((grupo, index) => {
          message += `${index + 1}. ${grupo.title}\n\`ID: ${grupo.id}\`\n\n`;
        });
        message += `Total de grupos ativos: ${updatedActiveGroups.length}`;
      }

      // Add warnings for not found or invalid groups
      if (notFoundIds.length > 0 || invalidGroupIds.length > 0) {
        message += '\n\n⚠️ Atenção:\n';
        if (notFoundIds.length > 0) {
          message += `Grupos não encontrados: \`${notFoundIds.join(', ')}\`\n`;
        }
        if (invalidGroupIds.length > 0) {
          message += `IDs não são grupos: \`${invalidGroupIds.join(', ')}\`\n`;
        }
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('[ERROR] Error activating groups:', error);
      if (error instanceof Error && error.message === 'Client not initialized') {
        await ctx.reply('❌ Cliente Telegram não está disponível. Por favor, faça login primeiro.');
      } else {
        await ctx.reply('❌ Erro ao ativar grupos. Por favor, tente novamente mais tarde.');
      }
    }
  }

  async handleDesativar(ctx: Context): Promise<void> {
    try {
      // Get logged in user ID from Telegram client
      const loggedInUserId = await this.telegramUserClient.getUserId();
      if (!loggedInUserId) {
        await ctx.reply('❌ Cliente Telegram não está logado. Por favor, faça login primeiro.');
        return;
      }

      const commandText = ctx.message?.text;
      if (!commandText) {
        await ctx.reply('❌ Comando inválido.');
        return;
      }

      // Extract group IDs from command: /desativar 123456 789012
      const parts = commandText.split(' ').slice(1); // Remove '/desativar'
      
      if (parts.length === 0) {
        await ctx.reply(
          '📝 Uso: /desativar <id1> [id2] [id3] ...\n\n' +
          'Exemplo: /desativar 123456789 -1234567890\n\n' +
          'Forneça pelo menos um ID de grupo para desativar.'
        );
        return;
      }

      const groupIds: number[] = [];
      const invalidIds: string[] = [];

      for (const part of parts) {
        const parsedId = Number.parseInt(part.trim(), 10);
        if (Number.isNaN(parsedId)) {
          invalidIds.push(part);
        } else {
          groupIds.push(parsedId);
        }
      }

      if (invalidIds.length > 0) {
        await ctx.reply(
          `❌ IDs inválidos: ${invalidIds.join(', ')}\n\n` +
          'Por favor, forneça apenas números válidos.'
        );
        return;
      }

      if (groupIds.length === 0) {
        await ctx.reply('❌ Nenhum ID válido fornecido.');
        return;
      }

      // Get current active groups using logged in user ID
      const currentActiveGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserId.toString());
      if (!currentActiveGroups || currentActiveGroups.length === 0) {
        await ctx.reply('ℹ️ Você não tem grupos ativos no momento.');
        return;
      }

      // Remove group IDs
      let removedCount = 0;
      const notFoundIds: number[] = [];

      for (const groupId of groupIds) {
        if (currentActiveGroups.includes(groupId)) {
          await this.activeGroupsRepository.removeActiveGroup(loggedInUserId.toString(), groupId);
          removedCount++;
        } else {
          notFoundIds.push(groupId);
        }
      }

      // Get updated active groups count using logged in user ID
      const updatedActiveGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserId.toString());
      const remainingCount = updatedActiveGroups?.length || 0;

      let message = '';
      if (removedCount > 0) {
        message = `✅ ${removedCount} grupo(s) desativado(s) com sucesso!\n\n`;
        message += `Grupos ativos restantes: ${remainingCount}\n`;
        message += `Grupos desativados: ${groupIds.filter(id => !notFoundIds.includes(id)).join(', ')}`;
        
        if (notFoundIds.length > 0) {
          message += `\n\n⚠️ Os seguintes grupos não estavam ativos: ${notFoundIds.join(', ')}`;
        }
      } else {
        message = `ℹ️ Nenhum dos grupos fornecidos estava ativo.\n\n`;
        message += `Grupos não encontrados: ${notFoundIds.join(', ')}`;
      }

      await ctx.reply(message);
    } catch (error) {
      console.error('[ERROR] Error deactivating groups:', error);
      await ctx.reply('❌ Erro ao desativar grupos. Por favor, tente novamente mais tarde.');
    }
  }

  async handleGruposAtivos(ctx: Context): Promise<void> {
    try {
      // Get logged in user ID from Telegram client
      const loggedInUserId = await this.telegramUserClient.getUserId();
      if (!loggedInUserId) {
        await ctx.reply('❌ Cliente Telegram não está logado. Por favor, faça login primeiro.');
        return;
      }

      // Get active groups from repository using logged in user ID
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserId.toString());
      
      if (!activeGroups || activeGroups.length === 0) {
        await ctx.reply('📭 Você não tem grupos ativos no momento.\n\nUse /ativar para ativar grupos.');
        return;
      }

      const grupos: Array<{ id: number; title: string }> = [];

      // Try to fetch group details for each active group
      for (const groupId of activeGroups) {
        try {
          const chat = await this.telegramUserClient.getChat(groupId);
          
          if (
            chat &&
            typeof chat === 'object' &&
            'title' in chat &&
            typeof chat.title === 'string'
          ) {
            grupos.push({ id: groupId, title: chat.title });
          } else {
            // If we can't get the title, just show the ID
            grupos.push({ id: groupId, title: 'Nome não disponível' });
          }
        } catch (error) {
          console.error(`[ERROR] Error fetching chat ${groupId}:`, error);
          // If we can't fetch the chat, just show the ID
          grupos.push({ id: groupId, title: 'Nome não disponível' });
        }
      }

      // Format the response
      let message = `✅ Grupos Ativos (${grupos.length}):\n\n`;
      grupos.forEach((grupo, index) => {
        message += `${index + 1}. ${grupo.title}\n\`${grupo.id}\`\n\n`;
      });

      // Telegram has a message length limit, so split if needed
      const maxLength = 4096;
      if (message.length > maxLength) {
        const chunks: string[] = [];
        let currentChunk = `✅ Grupos Ativos (${grupos.length}):\n\n`;
        let count = 0;

        for (const grupo of grupos) {
          const grupoLine = `${count + 1}. ${grupo.title}\n\`ID: ${grupo.id}\`\n\n`;
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
          await ctx.reply(chunk, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      console.error('[ERROR] Error fetching active groups:', error);
      if (error instanceof Error && error.message === 'Client not initialized') {
        await ctx.reply('❌ Cliente Telegram não está disponível. Por favor, faça login primeiro.');
      } else {
        await ctx.reply('❌ Erro ao buscar grupos ativos. Por favor, tente novamente mais tarde.');
      }
    }
  }
}

