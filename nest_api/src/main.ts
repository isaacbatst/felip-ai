import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

async function bootstrap() {
  const logger = new ConsoleLogger();
  logger.log('Starting application initialization...');

  // Create HTTP app first (hybrid mode)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger,
  });

  // Enable CORS for the auth page
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Serve static files from public directory
  // In production (dist), files are at dist/public
  // In development, files are at public (relative to project root)
  app.useStaticAssets(join(__dirname, 'public'), {
    prefix: '/public/',
  });

  // Get config service for RabbitMQ connection
  const configService = app.get(ConfigService);

  // Build RabbitMQ connection URL from ConfigService
  const host = configService.get<string>('RABBITMQ_HOST') || 'localhost';
  const port = configService.get<string>('RABBITMQ_PORT') || '5672';
  const user = configService.get<string>('RABBITMQ_USER') || 'guest';
  const password = configService.get<string>('RABBITMQ_PASSWORD') || 'guest';

  // URL encode username and password to handle special characters
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const url = `amqp://${encodedUser}:${encodedPassword}@${host}:${port}`;

  logger.log(`Connecting to RabbitMQ at ${host}:${port} with user ${user}`);

  // Connect RabbitMQ microservice to the hybrid app
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue: 'nest-api-queue',
      queueOptions: {
        durable: true,
      },
      noAck: false, // Manual acknowledgment for reliability
    },
  });

  logger.log('Microservice connected successfully');

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

    // Close the application (both HTTP and microservice)
    try {
      await app.close();
      logger.log('Application closed successfully');
    } catch (error) {
      logger.error('Error closing application:', error);
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

  // Start all microservices
  await app.startAllMicroservices();
  logger.log('Microservices started successfully');

  // Start HTTP server
  const httpPort = configService.get<number>('HTTP_PORT') || 3000;
  await app.listen(httpPort);
  logger.log(`HTTP server listening on port ${httpPort}`);
  logger.log('Application started successfully');
}

bootstrap().catch((error) => {
  console.error('[ERROR] Error starting application:', error);
  process.exit(1);
});
