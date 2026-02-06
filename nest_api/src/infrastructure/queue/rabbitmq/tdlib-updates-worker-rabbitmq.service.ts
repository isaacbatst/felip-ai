import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
import { TelegramUserQueueProcessorRabbitMQ } from './telegram-user-queue-processor-rabbitmq.service';
import { TdlibUpdateJobData } from '../../tdlib/tdlib-update.types';
import { ConversationRepository, ConversationData } from '../../persistence/conversation.repository';
import { TdlibCommandResponseHandler } from '../../tdlib/tdlib-command-response.handler';
import { MessageProcessedLogRepository } from '@/infrastructure/persistence/message-processed-log.repository';
import { TelegramUserClientProxyService } from '../../tdlib/telegram-user-client-proxy.service';

/**
 * Worker that consumes updates from tdlib_worker via RabbitMQ
 * Single Responsibility: consuming updates and forwarding them to the queue processor
 */
@Injectable()
export class TdlibUpdatesWorkerRabbitMQ implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TdlibUpdatesWorkerRabbitMQ.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private readonly queueName = 'tdlib-updates';
  private readonly rabbitmqConfig: {
    urls: string[];
    queueOptions: {
      durable: boolean;
    };
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramUserQueueProcessor: TelegramUserQueueProcessorRabbitMQ,
    private readonly conversationRepository: ConversationRepository,
    private readonly commandResponseHandler: TdlibCommandResponseHandler,
    private readonly messageProcessedLogRepository: MessageProcessedLogRepository,
    private readonly telegramUserClient: TelegramUserClientProxyService,
  ) {
    const host = this.configService.get<string>('RABBITMQ_HOST') || 'localhost';
    const port = this.configService.get<string>('RABBITMQ_PORT') || '5672';
    const user = this.configService.get<string>('RABBITMQ_USER') || 'guest';
    const password = this.configService.get<string>('RABBITMQ_PASSWORD') || 'guest';

    // URL encode username and password to handle special characters
    const encodedUser = encodeURIComponent(user);
    const encodedPassword = encodeURIComponent(password);
    const url = `amqp://${encodedUser}:${encodedPassword}@${host}:${port}`;

    // Log connection details (without password) for debugging
    this.logger.log(`RabbitMQ connection config: host=${host}, port=${port}, user=${user}`);

    this.rabbitmqConfig = {
      urls: [url],
      queueOptions: {
        durable: true,
      },
    };
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.setupConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const connectionUrl = this.rabbitmqConfig.urls[0];
      // Log connection URL without password for debugging
      const urlWithoutPassword = connectionUrl.replace(/:[^:@]+@/, ':****@');
      this.logger.log(`Attempting to connect to RabbitMQ: ${urlWithoutPassword}`);

      this.connection = await connect(connectionUrl);
      this.channel = await this.connection.createChannel();

      // Assert queue exists
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);

      this.logger.log(`Connected to RabbitMQ and asserted queue: ${this.queueName}`);
    } catch (error) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error}`);
      this.logger.error(`Connection URL (masked): ${this.rabbitmqConfig.urls[0].replace(/:[^:@]+@/, ':****@')}`);
      throw error;
    }
  }

  private async setupConsumer(): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      this.queueName,
      async (msg) => {
        if (!msg) {
          return;
        }

        try {
          const jobData = JSON.parse(msg.content.toString()) as {
            pattern: string;
            data: TdlibUpdateJobData;
          };

          await this.process(jobData.pattern, jobData.data);

          // Log successful processing
          await this.messageProcessedLogRepository.logProcessedMessage({
            queueName: this.queueName,
            messageData: jobData,
            userId: jobData.data.userId,
            status: 'success',
          }).catch((logError) => {
            this.logger.error(`[ERROR] Failed to log processed message: ${logError}`);
          });

          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing update: ${error}`);

          // Log failed processing
          try {
            const jobData = JSON.parse(msg.content.toString()) as {
              pattern: string;
              data: TdlibUpdateJobData;
            };
            await this.messageProcessedLogRepository.logProcessedMessage({
              queueName: this.queueName,
              messageData: jobData,
              userId: jobData.data.userId,
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
            }).catch((logError) => {
              this.logger.error(`[ERROR] Failed to log failed message: ${logError}`);
            });
          } catch (parseError) {
            this.logger.error(`[ERROR] Failed to parse message for logging: ${parseError}`);
          }

          // Acknowledge message to remove from queue (accept failure)
          this.channel?.ack(msg);
        }
      },
      {
        noAck: false, // Manual acknowledgment
      },
    );

    this.logger.log(`Consumer set up for queue: ${this.queueName}`);
  }

  /**
   * Processes a job from the queue
   */
  private async process(pattern: string, jobData: TdlibUpdateJobData): Promise<void> {
    this.logger.log(`[DEBUG] Processing job: ${pattern}`);

    switch (pattern) {
      case 'new-message': {
        const { update, userId } = jobData;
        if (update) {
          // Forward update to the queue processor with userId
          await this.telegramUserQueueProcessor.enqueue({ update, userId: userId?.toString() });
        }
        break;
      }
      case 'auth-code-request': {
        const { botUserId, retry } = jobData;
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

          // Prevent duplicate auth code requests: if session is already waiting for code and this is not a retry, skip
          if (session.state === 'waitingCode' && !retry) {
            this.logger.log(`[DEBUG] Skipping duplicate auth-code-request for session ${session.requestId} (already in waitingCode state)`);
            break;
          }

          // Update session state to waiting for auth code
          await this.conversationRepository.updateSessionState(session.requestId, 'waitingCode');
          this.logger.debug(`Session ${session.requestId} updated to waitingCode`);
        }
        break;
      }
      case 'password-request': {
        const { botUserId } = jobData;
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
          this.logger.debug(`Session ${session.requestId} updated to waitingPassword`);
        }
        break;
      }
      case 'authorization-state': {
        const { update } = jobData;
        if (update) {
          // Log authorization state changes
          this.logger.log('[DEBUG] Authorization state update received');
        }
        break;
      }
      case 'login-success': {
        const { botUserId, userInfo } = jobData;
        if (botUserId) {
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }

          // Find session: active first, then completed, then by actual userInfo.id
          let session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);

          if (!session) {
            this.logger.debug(`[DEBUG] Active session not found, trying completed session for loggedInUserId: ${loggedInUserId}`);
            session = await this.conversationRepository.getCompletedSessionByLoggedInUserId(loggedInUserId);
          }

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
              state: session.state
            });

            // Update loggedInUserId if it changed
            const actualLoggedInUserId = userInfo?.id ?? session.loggedInUserId;
            if (actualLoggedInUserId !== session.loggedInUserId) {
              const updatedConversation: ConversationData = {
                ...session,
                loggedInUserId: actualLoggedInUserId,
                state: 'completed',
              };
              await this.conversationRepository.setConversation(updatedConversation);
              this.logger.log('Session updated with new logged-in user ID', { oldLoggedInUserId: session.loggedInUserId, newLoggedInUserId: actualLoggedInUserId });
            } else {
              await this.conversationRepository.updateSessionState(session.requestId, 'completed');
              this.logger.log('Session marked as completed', { loggedInUserId });
            }
          } else {
            this.logger.error(`[ERROR] Session not found for loggedInUserId: ${loggedInUserId} when handling login success`, {
              botUserId,
              loggedInUserId,
              userInfoId: userInfo?.id,
            });
          }
        }
        break;
      }
      case 'login-failure': {
        const { botUserId, error } = jobData;
        if (botUserId) {
          const loggedInUserId = Number.parseInt(botUserId, 10);
          if (Number.isNaN(loggedInUserId)) {
            this.logger.error(`[ERROR] Invalid botUserId (not a number): ${botUserId}`);
            break;
          }
          const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(loggedInUserId);

          if (session) {
            // Check if this is an expired code error — automatically restart login
            const isPhoneCodeExpired = error && (
              error.includes('PHONE_CODE_EXPIRED') ||
              error.includes('phone code expired') ||
              error.includes('code expired') ||
              (error.includes('expired') && error.toLowerCase().includes('code'))
            );

            if (isPhoneCodeExpired && session.state === 'waitingCode' && session.phoneNumber) {
              this.logger.log(`Restarting login to generate new code for requestId: ${session.requestId} due to expired code`);
              try {
                await this.telegramUserClient.login(loggedInUserId.toString(), session.phoneNumber, session.requestId);
                return;
              } catch (restartError) {
                this.logger.error(`Failed to restart login for new code: ${restartError}`, { requestId: session.requestId });
              }
            }

            // Mark as failed
            await this.conversationRepository.updateSessionState(session.requestId, 'failed');
            this.logger.log('Session marked as failed', { loggedInUserId, requestId: session.requestId });
          } else {
            this.logger.error(`[ERROR] Active session not found for loggedInUserId: ${loggedInUserId} when handling login failure`);
          }
        }
        break;
      }
      case 'session-created': {
        // Sessions are now created in Nest API before dispatching login command
        // This event is kept for backward compatibility but is a no-op
        const { requestId } = jobData;
        this.logger.log(`[DEBUG] session-created event received (no-op, session already created in Nest API): ${requestId}`);
        break;
      }
      case 'session-state-updated': {
        const { botUserId, state } = jobData;
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
        const { botUserId } = jobData;
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
        const { requestId, commandType, result, error, context } = jobData;
        console.log(JSON.stringify(jobData, null, 2));
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
        this.logger.warn(`[WARN] Unknown job pattern: ${pattern}`);
    }
  }

  /**
   * Enqueues an update to the tdlib-updates queue
   */
  async enqueue(pattern: string, data: TdlibUpdateJobData): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Make sure RabbitMQ is connected.');
    }

    try {
      await this.channel.assertQueue(this.queueName, this.rabbitmqConfig.queueOptions);
      const message = Buffer.from(JSON.stringify({ pattern, data }));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: true,
      });
    } catch (error) {
      this.logger.error(`[ERROR] Error enqueueing update: ${error}`);
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(`Error disconnecting from RabbitMQ: ${error}`);
    }
  }
}
