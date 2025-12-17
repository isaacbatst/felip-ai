import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConsoleLogger, Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new ConsoleLogger();
  logger.log('Starting application initialization...');

  // Create standalone application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger,
  });

  logger.log('Application context created successfully');

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

    // Close the application context
    try {
      await app.close();
      logger.log('Application context closed successfully');
    } catch (error) {
      logger.error('Error closing application context:', error);
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

  logger.log('Application started successfully');
}

bootstrap().catch((error) => {
  console.error('[ERROR] Error starting application:', error);
  process.exit(1);
});
