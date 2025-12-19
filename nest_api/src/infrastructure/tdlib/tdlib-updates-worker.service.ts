import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramUserQueueProcessorBullMQ } from '../queue/bullmq/telegram-user-queue-processor-bullmq.service';
import { TelegramBotService } from '../telegram/telegram-bot-service';
import { TdlibUpdateJobData } from './tdlib-update.types';
import { TelegramBotLoginResultHandler } from '../telegram/handlers/telegram-bot-login-result.handler';
import { ConversationRepository } from '../persistence/conversation.repository';
import { TdlibCommandResponseHandler } from './tdlib-command-response.handler';

/**
 * Worker that consumes updates from tdlib_worker via BullMQ
 * Single Responsibility: consuming updates and forwarding them to the queue processor
 */
@Processor('tdlib-updates')
@Injectable()
export class TdlibUpdatesWorkerService extends WorkerHost {
  private readonly logger = new Logger(TdlibUpdatesWorkerService.name);

  constructor(
    private readonly telegramUserQueueProcessor: TelegramUserQueueProcessorBullMQ,
    private readonly botService: TelegramBotService,
    private readonly loginResultHandler: TelegramBotLoginResultHandler,
    private readonly conversationRepository: ConversationRepository,
    private readonly commandResponseHandler: TdlibCommandResponseHandler,
  ) {
    super();
  }

  /**
   * Updates session state to waiting for auth code
   */
  private async updateSessionToWaitingAuthCode(session: { requestId: string; telegramUserId: number; loggedInUserId: number }): Promise<number | null> {
    await this.conversationRepository.updateSessionState(session.requestId, 'waitingCode');
    return session.telegramUserId;
  }

  async process(job: Job<TdlibUpdateJobData, unknown, string>): Promise<void> {
    this.logger.log(`[DEBUG] Processing job: ${job.name}`);
    switch (job.name) {
      case 'new-message': {
        const { update, userId } = job.data;
        if (update) {
          // Forward update to the queue processor with userId
          await this.telegramUserQueueProcessor.enqueue({ update, userId: userId?.toString() });
        }
        break;
      }
      case 'auth-code-request': {
        const { botUserId, retry } = job.data;
        if (botUserId) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }
          const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
          if (!session) {
            this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId}`);
            break;
          }

          // Update session state to waiting for auth code
          const telegramUserId = await this.updateSessionToWaitingAuthCode(session);
          if (!telegramUserId) {
            console.error(`[ERROR] No telegramUserId found in session for loggedInUserId: ${loggedInUserId}`);
            break;
          }
          
          console.log(`[DEBUG] 🔐 Auth code requested for loggedInUserId: ${session.loggedInUserId}, telegramUserId: ${telegramUserId}, requestId: ${session.requestId}, retry: ${retry}`);
          
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
        const { botUserId } = job.data;
        if (botUserId) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }
          const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
          if (!session) {
            this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId}`);
            break;
          }

          // Update session state to waitingPassword
          await this.conversationRepository.updateSessionState(session.requestId, 'waitingPassword');

          this.logger.log(`[DEBUG] 🔒 Password requested for loggedInUserId: ${session.loggedInUserId}, telegramUserId: ${session.telegramUserId}, requestId: ${session.requestId}`);
          // TODO: Implement password handling if needed
          this.logger.warn(`[WARN] Password request not yet implemented for loggedInUserId: ${session.loggedInUserId}`);
        }
        break;
      }
      case 'authorization-state': {
        const { update } = job.data;
        if (update) {
          // Log authorization state changes
          this.logger.log('[DEBUG] Authorization state update received');
        }
        break;
      }
      case 'login-success': {
        const { botUserId, userInfo, error } = job.data;
        if (botUserId) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }
          let session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
          
          // If not found, try to get any session (including completed) by loggedInUserId
          if (!session) {
            this.logger.debug(`[DEBUG] Active session not found, trying completed session for loggedInUserId: ${loggedInUserId}`);
            session = await this.conversationRepository.getCompletedSessionByLoggedInUserId(loggedInUserId);
          }
          
          // If still not found and we have userInfo, try to find by the actual logged-in user ID
          if (!session && userInfo?.id) {
            const actualLoggedInUserId = userInfo.id;
            if (actualLoggedInUserId !== loggedInUserId) {
              this.logger.debug(`[DEBUG] Trying to find session by actual logged-in user ID: ${actualLoggedInUserId}`);
              session = await this.conversationRepository.getActiveSessionByLoggedInUserId(actualLoggedInUserId);
              if (!session) {
                session = await this.conversationRepository.getCompletedSessionByLoggedInUserId(actualLoggedInUserId);
              }
            }
          }
          
          if (session) {
            this.logger.log(`[DEBUG] Found session for login success`, { 
              requestId: session.requestId, 
              loggedInUserId: session.loggedInUserId,
              telegramUserId: session.telegramUserId,
              chatId: session.chatId,
              state: session.state 
            });
            await this.loginResultHandler.handleLoginSuccess({
              telegramUserId: session.telegramUserId,
              loggedInUserId: userInfo?.id ?? session.loggedInUserId,
              chatId: session.chatId,
              userInfo: userInfo ?? null,
              error,
            });
          } else {
            this.logger.error(`[ERROR] Session not found for loggedInUserId: ${loggedInUserId} when handling login success`, {
              botUserId,
              loggedInUserId,
              userInfoId: userInfo?.id,
            });
            // Try to send success message anyway if we have userInfo with a way to contact the user
            // This is a fallback in case session lookup fails but login was successful
            if (userInfo?.id) {
              this.logger.warn(`[WARN] Attempting to send success message without session`, { loggedInUserId: userInfo.id });
              // We can't send a message without chatId, so we just log the error
            }
          }
        }
        break;
      }
      case 'login-failure': {
        const { botUserId, error } = job.data;
        if (botUserId) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }
          const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
          if (session) {
            await this.loginResultHandler.handleLoginFailure({
              telegramUserId: session.telegramUserId,
              loggedInUserId: session.loggedInUserId,
              chatId: session.chatId,
              error: error || 'Unknown error',
            });
          } else {
            this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId} when handling login failure`);
          }
        }
        break;
      }
      case 'session-created': {
        // Sessions are now created in Nest API before dispatching login command
        // This event is kept for backward compatibility but is a no-op
        const { requestId } = job.data;
        this.logger.log(`[DEBUG] session-created event received (no-op, session already created in Nest API): ${requestId}`);
        break;
      }
      case 'session-state-updated': {
        const { botUserId, state } = job.data;
        if (botUserId && state) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (!Number.isNaN(loggedInUserId)) {
            const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
            if (session) {
              await this.conversationRepository.updateSessionState(
                session.requestId,
                state as 'idle' | 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed',
              );
              this.logger.log(`[DEBUG] Session state updated: ${session.requestId} -> ${state}`);
            } else {
              this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId} when updating state`);
            }
          }
        }
        break;
      }
      case 'session-deleted': {
        const { botUserId } = job.data;
        if (botUserId) {
          // Look up active session by loggedInUserId (botUserId is the loggedInUserId as string)
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (!Number.isNaN(loggedInUserId)) {
            const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);
            if (session) {
              await this.conversationRepository.deleteSession(session.requestId);
              this.logger.log(`[DEBUG] Session deleted: ${session.requestId}`);
            } else {
              this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId} when deleting`);
            }
          }
        }
        break;
      }
      case 'command-response': {
        const { requestId, commandType, result, error, context } = job.data;
        console.log(JSON.stringify(job.data, null, 2));
        if (requestId && context) {
          // Use context from response (echoed back from worker)
          await this.commandResponseHandler.handleResponse({
            requestId,
            commandType: commandType || context.commandType,
            result,
            error,
            context,
          });
        } else if (requestId) {
          this.logger.warn(`[WARN] Command response missing context for requestId: ${requestId}`);
        }
        break;
      }
      default:
        this.logger.warn(`[WARN] Unknown job name: ${job.name}`);
    }
  }
}

