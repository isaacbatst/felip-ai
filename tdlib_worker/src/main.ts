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
  userId?: string;
}

function loadConfig(): Config {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  const userId = process.env.USER_ID;

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set');
  }

  // Use per-user queue - USER_ID should always be set by worker manager
  // Queue name format: tdlib-commands-${userId} (must match nest_api dispatch format)
  if (!userId) {
    console.error('[ERROR] USER_ID environment variable is not set!');
    console.error('[ERROR] Worker must be started with USER_ID to listen to the correct queue.');
    console.error('[ERROR] Falling back to default queue (this may cause issues if multiple workers exist).');
  }
  
  const commandsQueue = userId
    ? `tdlib-commands-${userId}`
    : process.env.QUEUE_TDLIB_COMMANDS || 'tdlib-commands';

  return {
    telegram: {
      apiId: Number.parseInt(apiId, 10),
      apiHash,
      databaseDirectory: process.env.TELEGRAM_DATABASE_DIRECTORY,
      filesDirectory: process.env.TELEGRAM_FILES_DIRECTORY,
    },
    redis: {
      host: process.env.REDIS_HOST || 'host.docker.internal',
      port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    },
    queues: {
      updates: process.env.QUEUE_TDLIB_UPDATES || 'tdlib-updates',
      commands: commandsQueue,
      responses: process.env.QUEUE_TDLIB_RESPONSES || 'tdlib-responses',
    },
    http: {
      port: Number.parseInt(process.env.HTTP_PORT || '3001', 10),
    },
    userId,
  };
}

async function main() {
  console.log('[DEBUG] Starting TDLib Worker...');

  const config = loadConfig();
  
  if (config.userId) {
    console.log(`[DEBUG] ✅ Worker configured for user: ${config.userId}`);
    console.log(`[DEBUG] ✅ Listening to commands queue: ${config.queues.commands}`);
    console.log(`[DEBUG] ✅ Listening to updates queue: ${config.queues.updates}`);
  } else {
    console.warn('[WARN] ⚠️  USER_ID not set, using default queue (not recommended for production)');
    console.warn(`[WARN] ⚠️  Listening to commands queue: ${config.queues.commands}`);
  }

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
    config.userId,
  );
  updateHandler.setupHandlers();

  // Initialize command processor (receives commands from nest_api via BullMQ)
  const commandProcessor = new CommandProcessor(
    client,
    config.redis,
    config.queues.commands,
    config.queues.updates,
    config.userId, // Pass loggedInUserId to LoginSessionManager (USER_ID env var)
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

