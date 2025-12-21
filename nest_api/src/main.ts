import { NestFactory } from '@nestjs/core';
import { AsyncMicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const logger = new ConsoleLogger();
  logger.log('Starting application initialization...');

  // Create microservice with RabbitMQ transport using async options
  const app = await NestFactory.createMicroservice<AsyncMicroserviceOptions>(AppModule, {
    useFactory: (configService: ConfigService) => {
      // Build RabbitMQ connection URL from ConfigService
      const host = configService.get<string>('RABBITMQ_HOST') || 'localhost';
      const port = configService.get<string>('RABBITMQ_PORT') || '5672';
      const user = configService.get<string>('RABBITMQ_USER') || 'guest';
      const password = configService.get<string>('RABBITMQ_PASSWORD') || 'guest';
      const url = `amqp://${user}:${password}@${host}:${port}`;

      logger.log(`Connecting to RabbitMQ at ${host}:${port}`);

      return {
        transport: Transport.RMQ,
        options: {
          urls: [url],
          queue: 'nest-api-queue',
          queueOptions: {
            durable: true,
          },
          noAck: false, // Manual acknowledgment for reliability
        },
      };
    },
    inject: [ConfigService],
  });

  logger.log('Microservice created successfully');

  // Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return; // Prevent multiple shutdown attempts
    }
    isShuttingDown = true;

    logger.log(`Shutting down (${signal})...`);

    // Close stdin immediately to release any readline interfaces that might be blocking
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.destroy();
    } catch {
      // Ignore errors when closing stdin
    }

    // Close the microservice
    try {
      await app.close();
      logger.log('Microservice closed successfully');
    } catch (error) {
      logger.error('Error closing microservice:', error);
    }

    logger.log('Shutdown complete');
    process.exitCode = 0;
    process.exit(0);
  };

  // Register shutdown handlers
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Start listening to messages
  await app.listen();
  logger.log('Application started successfully');
}

bootstrap().catch((error) => {
  console.error('[ERROR] Error starting application:', error);
  process.exit(1);
});
