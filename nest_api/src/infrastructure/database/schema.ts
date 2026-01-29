import { pgTable, text, integer, bigint, timestamp, index, unique, jsonb, boolean } from 'drizzle-orm/pg-core';

/**
 * Sessions table - stores conversation and login session data
 */
export const sessions = pgTable(
  'sessions',
  {
    requestId: text('request_id').primaryKey(),
    loggedInUserId: bigint('logged_in_user_id', { mode: 'number' }).notNull(),
    telegramUserId: bigint('telegram_user_id', { mode: 'number' }).notNull(),
    phoneNumber: text('phone_number'),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    state: text('state').notNull(), // 'idle' | 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [
    index('sessions_telegram_user_id_idx').on(table.telegramUserId),
    index('sessions_logged_in_user_id_idx').on(table.loggedInUserId),
    index('sessions_state_idx').on(table.state),
  ],
);

/**
 * Active groups table - stores active groups per user
 */
export const activeGroups = pgTable(
  'active_groups',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(),
    groupId: bigint('group_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('active_groups_user_id_idx').on(table.userId),
    index('active_groups_user_id_group_id_idx').on(table.userId, table.groupId),
    unique('active_groups_user_id_group_id_unique').on(table.userId, table.groupId),
  ],
);

/**
 * Worker ports table - stores worker port assignments
 * Next available port is computed dynamically from this table (max port + 1)
 */
export const workerPorts = pgTable(
  'worker_ports',
  {
    userId: text('user_id').primaryKey(),
    port: integer('port').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
);

/**
 * Messages processed table - logs all messages that have been processed from queues
 */
export const messagesProcessed = pgTable(
  'messages_processed',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    queueName: text('queue_name').notNull(),
    messageData: jsonb('message_data').notNull(),
    userId: text('user_id'),
    status: text('status').notNull(), // 'success' | 'failed'
    errorMessage: text('error_message'),
    retryCount: integer('retry_count').default(0).notNull(),
    processedAt: timestamp('processed_at').defaultNow().notNull(),
  },
  (table) => [
    index('messages_processed_queue_name_idx').on(table.queueName),
    index('messages_processed_user_id_idx').on(table.userId),
    index('messages_processed_status_idx').on(table.status),
    index('messages_processed_processed_at_idx').on(table.processedAt),
  ],
);

/**
 * Messages enqueued table - logs all messages that have been enqueued to queues
 */
export const messagesEnqueued = pgTable(
  'messages_enqueued',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    queueName: text('queue_name').notNull(),
    messageData: jsonb('message_data').notNull(),
    userId: text('user_id'),
    enqueuedAt: timestamp('enqueued_at').defaultNow().notNull(),
  },
  (table) => [
    index('messages_enqueued_queue_name_idx').on(table.queueName),
    index('messages_enqueued_user_id_idx').on(table.userId),
    index('messages_enqueued_enqueued_at_idx').on(table.enqueuedAt),
  ],
);

/**
 * Bot status table - stores bot on/off status per user
 * Each user can have only one record, default is on (true)
 */
export const botStatus = pgTable(
  'bot_status',
  {
    userId: text('user_id').primaryKey(),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('bot_status_user_id_idx').on(table.userId),
  ],
);

/**
 * Auth tokens table - stores time-sensitive tokens for web-based auth code input
 * Tokens are generated when TDLib requests an auth code and sent to users via link
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    token: text('token').primaryKey(), // Secure random token (48 chars hex)
    requestId: text('request_id').notNull(), // FK to sessions.requestId
    expiresAt: timestamp('expires_at').notNull(), // Token expiration (e.g., 10 minutes)
    usedAt: timestamp('used_at'), // Null if not used, set on use
    attempts: integer('attempts').default(0).notNull(), // Number of code submission attempts
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('auth_tokens_request_id_idx').on(table.requestId),
    index('auth_tokens_expires_at_idx').on(table.expiresAt),
  ],
);
