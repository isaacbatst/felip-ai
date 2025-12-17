import * as dotenv from 'dotenv';
import { TelegramUserClient } from './telegram-user-client';
import { UpdateHandler } from './update-handler';
import { CommandProcessor } from './command-processor';
import { HttpApi } from './http-api';

// Load environment variables
dotenv.config();

interface Config {
  telegram: {
    apiId: number;
    apiHash: string;
    databaseDirectory?: string;
    filesDirectory?: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  queues: {
    updates: string;
    commands: string;
    responses: string;
  };
  http: {
    port: number;
  };
}

function loadConfig(): Config {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set');
  }

  return {
    telegram: {
      apiId: Number.parseInt(apiId, 10),
      apiHash,
      databaseDirectory: process.env.TELEGRAM_DATABASE_DIRECTORY,
      filesDirectory: process.env.TELEGRAM_FILES_DIRECTORY,
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    queues: {
      updates: process.env.QUEUE_TDLIB_UPDATES || 'tdlib-updates',
      commands: process.env.QUEUE_TDLIB_COMMANDS || 'tdlib-commands',
      responses: process.env.QUEUE_TDLIB_RESPONSES || 'tdlib-responses',
    },
    http: {
      port: Number.parseInt(process.env.HTTP_PORT || '3001', 10),
    },
  };
}

async function main() {
  console.log('[DEBUG] Starting TDLib Worker...');

  const config = loadConfig();

  // Initialize Telegram client
  const client = new TelegramUserClient({
    apiId: config.telegram.apiId,
    apiHash: config.telegram.apiHash,
    databaseDirectory: config.telegram.databaseDirectory,
    filesDirectory: config.telegram.filesDirectory,
  });

  await client.initialize();

  // Initialize update handler (sends updates to nest_api via BullMQ)
  const updateHandler = new UpdateHandler(
    client,
    config.redis,
    config.queues.updates,
  );
  updateHandler.setupHandlers();

  // Initialize command processor (receives commands from nest_api via BullMQ)
  const commandProcessor = new CommandProcessor(
    client,
    config.redis,
    config.queues.commands,
    config.queues.responses,
    config.queues.updates,
  );

  // Initialize HTTP API (receives commands from nest_api via HTTP)
  const httpApi = new HttpApi(client, config.http.port);
  await httpApi.start();

  console.log('[DEBUG] ✅ TDLib Worker started successfully');

  // Graceful shutdown handler
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log(`[DEBUG] Shutting down (${signal})...`);

    try {
      await httpApi.close();
      await updateHandler.close();
      await commandProcessor.close();
      await client.close();
      console.log('[DEBUG] TDLib Worker closed successfully');
    } catch (error) {
      console.error('[ERROR] Error during shutdown:', error);
    }

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
}

main().catch((error) => {
  console.error('[ERROR] Error starting TDLib Worker:', error);
  process.exit(1);
});

