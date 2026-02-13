import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Connection, Channel } from 'amqplib';
import { TdlibUpdateJobData } from '../../tdlib/tdlib-update.types';
import { TdlibCommandResponseHandler } from '../../tdlib/tdlib-command-response.handler';
import { TelegramUserMessageProcessor } from '../../telegram/telegram-user-message-processor';

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
    private readonly messageProcessor: TelegramUserMessageProcessor,
    private readonly commandResponseHandler: TdlibCommandResponseHandler,
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
      await this.channel.prefetch(10);

      await this.channel.assertQueue(this.queueName, {
        ...this.rabbitmqConfig.queueOptions,
        arguments: {
          'x-message-ttl': 60000,
          'x-max-length': 1000,
          'x-overflow': 'drop-head',
        },
      });

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

          // Acknowledge message after successful processing
          this.channel?.ack(msg);
        } catch (error) {
          this.logger.error(`[ERROR] Error processing update: ${error}`);

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
          // Process message directly (no second queue)
          await this.messageProcessor.processMessage({ update, userId: userId?.toString() });
        }
        break;
      }
      case 'auth-code-request': {
        const { botUserId } = jobData;
        this.logger.log(`[DEBUG] auth-code-request event received for botUserId: ${botUserId}`);
        break;
      }
      case 'password-request': {
        const { botUserId } = jobData;
        this.logger.log(`[DEBUG] password-request event received for botUserId: ${botUserId}`);
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
        this.logger.log(`[DEBUG] login-success event received for botUserId: ${botUserId}`, { userInfo });
        break;
      }
      case 'login-failure': {
        const { botUserId, error } = jobData;
        this.logger.log(`[DEBUG] login-failure event received for botUserId: ${botUserId}`, { error });
        break;
      }
      case 'command-response': {
        const { requestId, commandType, result, error, context } = jobData;
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
      const message = Buffer.from(JSON.stringify({ pattern, data }));
      this.channel.sendToQueue(this.queueName, message, {
        persistent: false,
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
