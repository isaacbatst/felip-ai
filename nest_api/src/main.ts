import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[DEBUG] Starting application initialization...');

  // Create standalone application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  console.log('[DEBUG] Application context created successfully');

  // Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return; // Prevent multiple shutdown attempts
    }
    isShuttingDown = true;

    console.log(`[DEBUG] Shutting down (${signal})...`);

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
      console.log('[DEBUG] Application context closed successfully');
    } catch (error) {
      console.error('[ERROR] Error closing application context:', error);
    }

    console.log('[DEBUG] Shutdown complete');
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

  console.log('[DEBUG] Application started successfully');
}

bootstrap().catch((error) => {
  console.error('[ERROR] Error starting application:', error);
  process.exit(1);
});
