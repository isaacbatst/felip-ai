import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { Injectable, Logger } from '@nestjs/common';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { randomUUID } from 'node:crypto';

/**
 * Handler responsável por processar entrada de número de telefone durante o fluxo de login
 * Single Responsibility: apenas processamento de número de telefone
 * Composition: usa services para validar e realizar login
 */
@Injectable()
export class TelegramPhoneNumberHandler {
  private readonly logger = new Logger(TelegramPhoneNumberHandler.name);

  constructor(
    private readonly client: TelegramUserClientProxyService,
    private readonly phoneWhitelist: PhoneWhitelistService,
    private readonly botService: TelegramBotService,
    private readonly workerManager: WorkerManager,
    private readonly conversationRepository: ConversationRepository,
  ) {}

  async handlePhoneNumberInput(input: {
    chatId: number;
    phoneNumber: string;
    userId: number;
  }): Promise<void> {
    const { chatId, phoneNumber, userId } = input;
    // Validate phone number format (should start with +)
    const normalizedPhone = phoneNumber.trim();
    if (!normalizedPhone.startsWith('+')) {
      this.logger.warn('Phone number format invalid', { phoneNumber });
      await this.botService.bot.api.sendMessage(
        chatId,
        '❌ Formato inválido. Por favor, envie o número no formato internacional começando com +.\n\n' +
          'Exemplo: +5511999999999',
      );
      return;
    }

    // Check if phone number is in whitelist
    if (!this.phoneWhitelist.isAllowed(normalizedPhone)) {
      this.logger.warn('Phone number not allowed, clearing session', { phoneNumber });
      const session = await this.conversationRepository.getSessionByTelegramUserId(userId);
      if (session) {
        await this.conversationRepository.deleteSession(session.requestId);
      }
      await this.botService.bot.api.sendMessage(
        chatId,
        '❌ Seu número não está autorizado.\n\n' +
          'Por favor, entre em contato com o suporte para habilitar seu número.',
      );
      return;
    }

    // Inform user that login is starting
    await this.botService.bot.api.sendMessage(
      chatId,
      '🔄 Iniciando processo de login...',
    );

    const isWorkerRunning = await this.workerManager.run(userId.toString());
    if (!isWorkerRunning) {
      this.logger.error('Failed to start worker', { userId });
      await this.botService.bot.api.sendMessage(
        chatId,
        '❌ Falha ao iniciar o worker. Por favor, tente novamente mais tarde.',
      );
      return;
    }

    // Get existing conversation for this telegram user
    // CRITICAL: A telegram user must have only one conversation at a time
    let session = await this.conversationRepository.getSessionByTelegramUserId(userId);
    
    if (!session) {
      // Create new conversation for this telegram user
      // Initially, loggedInUserId is set to telegramUserId (will be updated when login completes if different)
      const requestId = randomUUID();
      session = {
        requestId,
        loggedInUserId: userId, // Initially same as telegramUserId, updated when login completes
        telegramUserId: userId,
        phoneNumber: normalizedPhone,
        chatId,
        state: 'waitingPhone',
      };
    } else {
      // Update existing conversation with phone number
      // This ensures we reuse the same conversation for the same telegram user
      session.phoneNumber = normalizedPhone;
      session.chatId = chatId; // Update chatId in case it changed
      session.state = 'waitingPhone';
    }
    
    // Store conversation - setConversation will ensure uniqueness per telegramUserId
    await this.conversationRepository.setSession(session);
    this.logger.log('Session created/updated', { requestId: session.requestId, phoneNumber, loggedInUserId: session.loggedInUserId });

    // Perform login (dispatched to queue, processed separately)
    // Auth code request will be handled by TdlibUpdatesWorkerService when tdlib dispatches auth-code-request event
    // Success/failure will be handled by TelegramBotLoginResultHandler via tdlib-updates queue
    // Use loggedInUserId.toString() as the worker identifier
    this.logger.log('Dispatching login to queue', { phoneNumber, requestId: session.requestId, loggedInUserId: session.loggedInUserId });
    await this.client.login(session.loggedInUserId.toString(), normalizedPhone, session.requestId);
  }
}
