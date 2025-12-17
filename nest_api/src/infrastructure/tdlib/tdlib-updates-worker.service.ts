import { Injectable } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramUserQueueProcessorBullMQ } from '../queue/bullmq/telegram-user-queue-processor-bullmq.service';
import { ConversationState, ConversationStateService } from '../telegram/conversation-state.service';
import { TelegramBotService } from '../telegram/telegram-bot-service';
import { TdlibUpdateJobData } from './tdlib-update.types';
import { TelegramBotLoginResultHandler } from '../telegram/handlers/telegram-bot-login-result.handler';
import { ConversationRepository } from '../persistence/conversation.repository';

/**
 * Worker that consumes updates from tdlib_worker via BullMQ
 * Single Responsibility: consuming updates and forwarding them to the queue processor
 */
@Processor('tdlib-updates')
@Injectable()
export class TdlibUpdatesWorkerService extends WorkerHost {
  constructor(
    private readonly telegramUserQueueProcessor: TelegramUserQueueProcessorBullMQ,
    private readonly conversationState: ConversationStateService,
    private readonly botService: TelegramBotService,
    private readonly loginResultHandler: TelegramBotLoginResultHandler,
    private readonly conversationRepository: ConversationRepository,
  ) {
    super();
  }

  async process(job: Job<TdlibUpdateJobData, unknown, string>): Promise<void> {
    switch (job.name) {
      case 'new-message': {
        const { update } = job.data;
        if (update) {
          // Forward update to the queue processor
          await this.telegramUserQueueProcessor.enqueue({ update });
        }
        break;
      }
      case 'auth-code-request': {
        const { requestId, retry } = job.data;
        if (requestId) {
          // Look up session data from Redis
          const session = await this.conversationRepository.getLoginSession(requestId);
          if (!session) {
            console.error(`[ERROR] Session not found for requestId: ${requestId}`);
            break;
          }

          // Worker is requesting auth code
          // Store the requestId mapping so TelegramAuthCodeHandler can send the code back
          console.log(`[DEBUG] 🔐 Auth code requested for userId: ${session.userId}, requestId: ${requestId}, retry: ${retry}`);
          await this.conversationState.setPendingAuthCodeRequestId(session.userId, requestId);
          
          // Set conversation state to waiting for auth code
          await this.conversationState.setState(session.userId, ConversationState.WAITING_AUTH_CODE);
          
          // Inform user that auth code is needed
          await this.botService.bot.api.sendMessage(
            session.chatId,
            '🔐 Por favor, envie o código de autenticação que você recebeu no Telegram.\n\n' +
              'O código geralmente tem 5 dígitos.',
          );
        }
        break;
      }
      case 'password-request': {
        const { requestId } = job.data;
        if (requestId) {
          // Look up session data from Redis
          const session = await this.conversationRepository.getLoginSession(requestId);
          if (!session) {
            console.error(`[ERROR] Session not found for requestId: ${requestId}`);
            break;
          }

          // Worker is requesting password
          console.log(`[DEBUG] 🔒 Password requested for userId: ${session.userId}, requestId: ${requestId}`);
          // TODO: Implement password handling if needed
          console.warn(`[WARN] Password request not yet implemented for userId: ${session.userId}`);
        }
        break;
      }
      case 'authorization-state': {
        const { update } = job.data;
        if (update) {
          // Log authorization state changes
          console.log('[DEBUG] Authorization state update received');
        }
        break;
      }
      case 'login-success': {
        const { requestId, userInfo, error } = job.data;
        if (requestId) {
          // Look up session data from Redis
          const session = await this.conversationRepository.getLoginSession(requestId);
          if (session) {
            await this.loginResultHandler.handleLoginSuccess({
              userId: session.userId,
              chatId: session.chatId,
              userInfo: userInfo ?? null,
              error,
            });
          } else {
            console.error(`[ERROR] Session not found for requestId: ${requestId} when handling login success`);
          }
        }
        break;
      }
      case 'login-failure': {
        const { requestId, error } = job.data;
        if (requestId) {
          // Look up session data from Redis
          const session = await this.conversationRepository.getLoginSession(requestId);
          if (session) {
            await this.loginResultHandler.handleLoginFailure({
              userId: session.userId,
              chatId: session.chatId,
              error: error || 'Unknown error',
            });
          } else {
            console.error(`[ERROR] Session not found for requestId: ${requestId} when handling login failure`);
          }
        }
        break;
      }
      case 'session-created': {
        const { requestId, userId, phoneNumber, chatId, state } = job.data;
        if (requestId && userId && phoneNumber && chatId !== undefined && state) {
          // Store session in Redis when TDLib worker creates it
          await this.conversationRepository.setLoginSession({
            requestId,
            userId,
            phoneNumber,
            chatId,
            state: state as 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed',
          });
          console.log(`[DEBUG] Session created and stored: ${requestId} for userId: ${userId}`);
        }
        break;
      }
      case 'session-state-updated': {
        const { requestId, userId, state } = job.data;
        if (requestId && state) {
          // Update session state in Redis when TDLib worker updates it
          await this.conversationRepository.updateLoginSessionState(
            requestId,
            state as 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed',
          );
          console.log(`[DEBUG] Session state updated: ${requestId} -> ${state}`);
        }
        break;
      }
      case 'session-deleted': {
        const { requestId, userId } = job.data;
        if (requestId) {
          // Delete session from Redis when TDLib worker deletes it
          await this.conversationRepository.deleteLoginSession(requestId);
          console.log(`[DEBUG] Session deleted: ${requestId} for userId: ${userId}`);
        }
        break;
      }
      default:
        console.warn(`[WARN] Unknown job name: ${job.name}`);
    }
  }
}

