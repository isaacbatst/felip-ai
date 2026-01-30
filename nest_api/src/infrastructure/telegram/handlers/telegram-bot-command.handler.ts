import { Injectable, Logger } from '@nestjs/common';
import type { Context } from 'grammy';
import { QuoteFormatterService } from '../../../domain/services/quote-formatter.service';
import { PriceTableProvider } from '@/domain/interfaces/price-table-provider.interface';
import { ConversationRepository, ConversationData } from '@/infrastructure/persistence/conversation.repository';
import { TelegramUserClientProxyService } from '../../tdlib/telegram-user-client-proxy.service';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { BotStatusRepository } from '@/infrastructure/persistence/bot-status.repository';
import { DashboardTokenRepository } from '@/infrastructure/persistence/dashboard-token.repository';
import { AppConfigService } from '@/config/app.config';
import type {
  CommandContext,
} from '@felip-ai/shared-types';

/**
 * Handler responsável por processar comandos do Telegram
 * Single Responsibility: apenas processamento de comandos
 */
@Injectable()
export class TelegramCommandHandler {
  
  private readonly logger = new Logger(TelegramCommandHandler.name);
  constructor(
    private readonly priceTableCache: PriceTableProvider,
    private readonly quoteFormatter: QuoteFormatterService,
    private readonly conversationRepository: ConversationRepository,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
    private readonly botStatusRepository: BotStatusRepository,
    private readonly dashboardTokenRepository: DashboardTokenRepository,
    private readonly appConfig: AppConfigService,
  ) {}

  async handleStart(ctx: Context): Promise<void> {
    // Revalida o cache antes de mostrar a tabela
    const priceTableResult = await this.priceTableCache.getPriceTable();
    const priceTablesFormatted = this.quoteFormatter.formatPriceTablesByProvider(priceTableResult.priceTables);

    const welcomeMessage = `📊 Tabelas de Preços por Provedor (1 CPF):${priceTablesFormatted}`;

    await ctx.reply(welcomeMessage);
  }

  async handleLogin(ctx: Context): Promise<void> {
    const telegramUserId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    if (!telegramUserId || !chatId) {
      await ctx.reply('❌ Não foi possível identificar seu usuário.');
      return;
    }

    // Check if user is already logged in
    const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
    if (loggedInUserId) {
      await ctx.reply(
        `✅ Você já está logado como usuário ID: ${loggedInUserId}\n\n` +
        'Use /logout para fazer logout antes de fazer login novamente.'
      );
      return;
    }

    // Check if there's already an active conversation (login in progress)
    const existingConversation = await this.conversationRepository.getConversationByTelegramUserId(telegramUserId);
    if (existingConversation && existingConversation.state !== 'completed' && existingConversation.state !== 'failed') {
      // Delete existing active conversation to start fresh
      // This will invalidate any pending auth codes from the previous login attempt
      await this.conversationRepository.deleteConversation(existingConversation.requestId);
      
      // Clear any submitted code flags for the old session to prevent confusion
      // Note: AuthCodeDeduplicationService will be injected if needed, but for now we rely on requestId mismatch
      // The old requestId will be different from the new one, so codes won't conflict
    }

    // Create a conversation in waitingPhone state
    // Initially, loggedInUserId is set to telegramUserId (will be updated when login completes if different)
    const { randomUUID } = await import('node:crypto');
    const requestId = randomUUID();
    const conversation: ConversationData = {
      requestId,
      loggedInUserId: telegramUserId, // Initially same as telegramUserId, updated when login completes
      telegramUserId,
      chatId,
      state: 'waitingPhone',
    };
    await this.conversationRepository.setConversation(conversation);

    const message =
      '📱 Por favor, envie seu número de telefone no formato internacional.\n\n' +
      'Exemplo: +5511999999999\n\n' +
      'O número deve começar com + seguido do código do país.';

    await ctx.reply(message);
  }

  async handleGrupos(ctx: Context): Promise<void> {
    try {
      const userId = ctx.from?.id?.toString();
      const chatId = ctx.chat?.id;
      if (!userId || !chatId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      // Call getChats via HTTP (synchronous)
      await ctx.reply('🔄 Buscando grupos...');
      
      try {
        const result = await this.telegramUserClient.getChats(
          userId,
          { _: 'chatListMain' },
          100,
        ) as { chat_ids?: number[] };

        if (!result?.chat_ids || !Array.isArray(result.chat_ids)) {
          await ctx.reply('❌ Não foi possível obter a lista de grupos.');
          return;
        }

        const chatIds = result.chat_ids;
        const groups: Array<{ id: number; title: string }> = [];

        // Fetch each chat via HTTP to filter groups
        for (const chatIdToFetch of chatIds) {
          try {
            const chatResult = await this.telegramUserClient.getChat(userId, chatIdToFetch) as {
              type?: { _?: string };
              title?: string;
            } | null;

            if (
              chatResult &&
              typeof chatResult === 'object' &&
              chatResult.type &&
              typeof chatResult.type === 'object' &&
              '_' in chatResult.type
            ) {
              const chatType = chatResult.type._;
              // Only include groups and supergroups
              if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
                const title = typeof chatResult.title === 'string' ? chatResult.title : 'Sem título';
                groups.push({ id: chatIdToFetch, title });
              }
            }
          } catch (error) {
            this.logger.warn(`Error fetching chat ${chatIdToFetch}`, { error });
            // Continue with other chats
          }
        }

        // Send groups list
        if (groups.length === 0) {
          await ctx.reply('📭 Você não está em nenhum grupo.');
          return;
        }

        let message = `📋 Grupos que você está participando (${groups.length}):\n\n`;
        groups.forEach((grupo, index) => {
          message += `${index + 1}. ${grupo.title}\`${grupo.id}\`\n\n`;
        });

        const maxLength = 4096;
        if (message.length > maxLength) {
          const chunks: string[] = [];
          let currentChunk = `📋 Grupos que você está participando (${groups.length}):\n\n`;
          let count = 0;

          for (const grupo of groups) {
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

          for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'Markdown' });
          }
        } else {
          await ctx.reply(message, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        this.logger.error('Error fetching groups', { error, userId });
        await ctx.reply('❌ Erro ao buscar grupos. Por favor, tente novamente.');
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
      const userId = ctx.from?.id?.toString();
      const chatId = ctx.chat?.id;
      if (!userId || !chatId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      const telegramUserId = ctx.from?.id;
      if (telegramUserId) {
        // Get and delete the conversation
        const conversation = await this.conversationRepository.getConversationByTelegramUserId(telegramUserId);
        if (conversation) {
          await this.conversationRepository.deleteConversation(conversation.requestId);
        }
      }

      // Dispatch logout command with context
      const context: CommandContext = {
        userId,
        commandType: 'logOut',
        chatId,
      };
      await this.telegramUserClient.dispatchCommandWithContext(
        userId,
        {
          type: 'logOut',
          payload: {},
        },
        context,
      );

      await ctx.reply('🔄 Realizando logout...');
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
      const botUserId = ctx.from?.id?.toString();
      const chatId = ctx.chat?.id;
      if (!botUserId || !chatId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
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

      // Check if user is logged in
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      this.logger.debug('loggedInUserId', { loggedInUserId });
      this.logger.debug('telegramUserId', { telegramUserId });
      if (!loggedInUserId) {
        await ctx.reply('❌ Você não está logado. Por favor, faça login primeiro usando /login.');
        return;
      }

      // Validate groups synchronously via HTTP
      await ctx.reply('🔄 Validando grupos...');

      // Validate each groupId synchronously via HTTP using loggedInUserId as worker identifier
      const validatedGroups: Array<{ id: number; title: string }> = [];
      const notFoundIds: number[] = [];
      const invalidGroupIds: number[] = [];

      for (const groupId of groupIds) {
        try {
          const chatResult = await this.telegramUserClient.getChat(telegramUserId.toString(), groupId) as {
            type?: { _?: string };
            title?: string;
          } | null;

          if (
            chatResult &&
            typeof chatResult === 'object' &&
            chatResult.type &&
            typeof chatResult.type === 'object' &&
            '_' in chatResult.type
          ) {
            const chatType = chatResult.type._;
            // Only allow groups and supergroups
            if (chatType === 'chatTypeBasicGroup' || chatType === 'chatTypeSupergroup') {
              const title = 'title' in chatResult && typeof chatResult.title === 'string' ? chatResult.title : 'Sem título';
              validatedGroups.push({ id: groupId, title });
            } else {
              invalidGroupIds.push(groupId);
            }
          } else {
            notFoundIds.push(groupId);
          }
        } catch (error) {
          this.logger.warn(`Error fetching chat ${groupId}`, { error });
          notFoundIds.push(groupId);
        }
      }

      // Process activation synchronously using loggedInUserId
      await this.processActivateGroups(ctx, validatedGroups, notFoundIds, invalidGroupIds, loggedInUserId);
    } catch (error) {
      this.logger.error('Error activating groups', { error });
      await ctx.reply('❌ Erro ao ativar grupos. Por favor, tente novamente mais tarde.');
    }
  }

  private async processActivateGroups(
    ctx: Context,
    validatedGroups: Array<{ id: number; title: string }>,
    notFoundIds: number[],
    invalidGroupIds: number[],
    loggedInUserId: number,
  ): Promise<void> {
    // If no valid groups found, return error
    if (validatedGroups.length === 0) {
      let errorMessage = '❌ Nenhum grupo válido encontrado.\n\n';
      if (notFoundIds.length > 0) {
        errorMessage += `Grupos não encontrados: \`${notFoundIds.join(', ')}\`\n\n`;
      }
      if (invalidGroupIds.length > 0) {
        errorMessage += `IDs não são grupos: \`${invalidGroupIds.join(', ')}\`\n\n`;
      }
      errorMessage += 'Verifique se os IDs estão corretos e se você tem acesso aos grupos.\n\n';
      errorMessage += 'Use o comando /grupos para ver a lista de grupos que você está participando.';
      await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
      return;
    }

    // Get current active groups for the logged-in user
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

    // Save updated active groups for the logged-in user
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
  }

  async handleDesativar(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Não foi possível identificar o chat.');
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

      // Check if user is logged in
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      if (!loggedInUserId) {
        await ctx.reply('❌ Você não está logado. Por favor, faça login primeiro usando /login.');
        return;
      }

      // Get current active groups for the logged-in user
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

      // Get updated active groups count
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
      this.logger.error('Error deactivating groups', { error });
      await ctx.reply('❌ Erro ao desativar grupos. Por favor, tente novamente mais tarde.');
    }
  }

  async handleGruposAtivos(ctx: Context): Promise<void> {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        await ctx.reply('❌ Não foi possível identificar o chat.');
        return;
      }

      // Check if user is logged in
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      if (!loggedInUserId) {
        await ctx.reply('❌ Você não está logado. Por favor, faça login primeiro usando /login.');
        return;
      }

      // Get active groups from repository for the logged-in user
      const activeGroups = await this.activeGroupsRepository.getActiveGroups(loggedInUserId.toString());
      
      if (!activeGroups || activeGroups.length === 0) {
        await ctx.reply(
          '📭 Você não tem grupos ativos no momento.\n\nUse /ativar para ativar grupos.',
        );
        return;
      }

      // Fetch chat titles synchronously via HTTP
      await ctx.reply('🔄 Buscando grupos ativos...');
      
      const grupos: Array<{ id: number; title: string }> = [];

      for (const groupId of activeGroups) {
        try {
          const chatResult = await this.telegramUserClient.getChat(telegramUserId.toString(), groupId) as {
            title?: string;
          } | null;

          if (
            chatResult &&
            typeof chatResult === 'object' &&
            'title' in chatResult &&
            typeof chatResult.title === 'string'
          ) {
            grupos.push({ id: groupId, title: chatResult.title });
          } else {
            // If we can't get the title, just show the ID
            grupos.push({ id: groupId, title: 'Nome não disponível' });
          }
        } catch (error) {
          this.logger.warn(`Error fetching chat ${groupId}`, { error });
          // If we can't get the title, just show the ID
          grupos.push({ id: groupId, title: 'Nome não disponível' });
        }
      }

      // Format and send the response
      await this.sendActiveGroupsList(ctx, grupos);
    } catch (error) {
      this.logger.error('Error fetching active groups', { error });
      await ctx.reply('❌ Erro ao buscar grupos ativos. Por favor, tente novamente mais tarde.');
    }
  }

  private async sendActiveGroupsList(ctx: Context, grupos: Array<{ id: number; title: string }>): Promise<void> {
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
  }

  async handleOn(ctx: Context): Promise<void> {
    try {
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      // Check if user is logged in
      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      if (!loggedInUserId) {
        await ctx.reply('❌ Você precisa estar logado para usar este comando.\n\nUse /login para fazer login.');
        return;
      }

      // Set bot status to enabled
      const loggedInUserIdStr = loggedInUserId.toString();
      await this.botStatusRepository.setBotStatus(loggedInUserIdStr, true);

      await ctx.reply('✅ Bot ativado!\n\nO bot agora processará mensagens dos grupos ativos.');
    } catch (error) {
      this.logger.error('Error handling /on command', { error });
      await ctx.reply('❌ Erro ao ativar o bot. Tente novamente.');
    }
  }

  async handleOff(ctx: Context): Promise<void> {
    try {
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      // Check if user is logged in
      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      if (!loggedInUserId) {
        await ctx.reply('❌ Você precisa estar logado para usar este comando.\n\nUse /login para fazer login.');
        return;
      }

      // Set bot status to disabled
      const loggedInUserIdStr = loggedInUserId.toString();
      await this.botStatusRepository.setBotStatus(loggedInUserIdStr, false);

      await ctx.reply('⏸️ Bot desativado!\n\nO bot não processará mais mensagens dos grupos ativos.\n\nUse /on para reativar.');
    } catch (error) {
      this.logger.error('Error handling /off command', { error });
      await ctx.reply('❌ Erro ao desativar o bot. Tente novamente.');
    }
  }

  async handleDashboard(ctx: Context): Promise<void> {
    try {
      const telegramUserId = ctx.from?.id;
      if (!telegramUserId) {
        await ctx.reply('❌ Não foi possível identificar seu usuário.');
        return;
      }

      // Check if user is logged in
      const loggedInUserId = await this.conversationRepository.isLoggedIn(telegramUserId);
      if (!loggedInUserId) {
        await ctx.reply('❌ Você precisa estar logado para usar este comando.\n\nUse /login para fazer login.');
        return;
      }

      // Generate dashboard access token (60 minutes TTL)
      const loggedInUserIdStr = loggedInUserId.toString();
      const { token, expiresAt } = await this.dashboardTokenRepository.createToken(loggedInUserIdStr, 60);

      // Build dashboard URL
      const baseUrl = this.appConfig.getAppBaseUrl();
      const dashboardUrl = `${baseUrl}/dashboard/${token}`;

      // Format expiration time
      const expiresInMinutes = Math.round((expiresAt.getTime() - Date.now()) / 60000);

      const message = 
        `⚙️ *Dashboard de Configurações*\n\n` +
        `Acesse o link abaixo para gerenciar suas configurações de milhas:\n\n` +
        `🔗 [Abrir Dashboard](${dashboardUrl})\n\n` +
        `⏱️ Este link expira em ${expiresInMinutes} minutos.\n\n` +
        `_No dashboard você pode configurar:_\n` +
        `• Tabelas de preços por programa\n` +
        `• Preços máximos (PREÇO TETO)\n` +
        `• Estoque de milhas disponíveis`;

      await ctx.reply(message, { 
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      });

      this.logger.log(`Dashboard token generated for user ${loggedInUserIdStr}`);
    } catch (error) {
      this.logger.error('Error handling /dashboard command', { error });
      await ctx.reply('❌ Erro ao gerar link do dashboard. Tente novamente.');
    }
  }
}

