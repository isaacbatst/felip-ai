import { pgTable, text, integer, bigint, timestamp, index, unique, jsonb, boolean, real } from 'drizzle-orm/pg-core';

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

// ============================================================================
// User Data Management Tables (replacing Google Spreadsheet)
// ============================================================================

/**
 * Miles programs table - global list of available miles programs
 * Supports liminar relationships (e.g., SMILES LIMINAR is liminar version of SMILES)
 * If liminarOfId is NULL, it's a normal program. If NOT NULL, it's a liminar version.
 */
export const milesPrograms = pgTable(
  'miles_programs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: text('name').notNull().unique(), // Program name (e.g., "SMILES", "SMILES LIMINAR")
    liminarOfId: integer('liminar_of_id'), // References miles_programs.id (NULL = normal, NOT NULL = liminar of that program)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('miles_programs_name_idx').on(table.name),
    index('miles_programs_liminar_of_id_idx').on(table.liminarOfId),
  ],
);

/**
 * Dashboard tokens table - stores time-sensitive tokens for web dashboard access
 * Users get a link via bot command to access their dashboard
 */
export const dashboardTokens = pgTable(
  'dashboard_tokens',
  {
    token: text('token').primaryKey(), // Secure random token (48 chars hex)
    userId: text('user_id').notNull(), // Telegram user ID
    expiresAt: timestamp('expires_at').notNull(), // Token expiration
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('dashboard_tokens_user_id_idx').on(table.userId),
    index('dashboard_tokens_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * User price entries table - per-user price tables
 * Each user can have different prices per program and quantity tier
 */
export const userPriceEntries = pgTable(
  'user_price_entries',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(), // Telegram user ID
    programId: integer('program_id').notNull(), // References miles_programs.id
    quantity: integer('quantity').notNull(), // Quantity tier (e.g., 15, 30, 50 for 15k, 30k, 50k)
    price: real('price').notNull(), // Price for this quantity
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_price_entries_user_id_idx').on(table.userId),
    index('user_price_entries_program_id_idx').on(table.programId),
    unique('user_price_entries_user_program_quantity_unique').on(table.userId, table.programId, table.quantity),
  ],
);

/**
 * User max prices table - per-user PREÇO TETO (maximum price) per program
 */
export const userMaxPrices = pgTable(
  'user_max_prices',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(), // Telegram user ID
    programId: integer('program_id').notNull(), // References miles_programs.id
    maxPrice: real('max_price').notNull(), // Maximum price limit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_max_prices_user_id_idx').on(table.userId),
    index('user_max_prices_program_id_idx').on(table.programId),
    unique('user_max_prices_user_program_unique').on(table.userId, table.programId),
  ],
);

/**
 * User available miles table - per-user stock/availability per program
 */
export const userAvailableMiles = pgTable(
  'user_available_miles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: text('user_id').notNull(), // Telegram user ID
    programId: integer('program_id').notNull(), // References miles_programs.id
    availableMiles: integer('available_miles').notNull(), // Available miles stock
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_available_miles_user_id_idx').on(table.userId),
    index('user_available_miles_program_id_idx').on(table.programId),
    unique('user_available_miles_user_program_unique').on(table.userId, table.programId),
  ],
);

/**
 * User counter offer settings table - per-user settings for private counter offer feature
 * When a buyer's offered price is below the seller's price but within a threshold,
 * the bot can send a private message with a counter offer instead of responding in the group
 */
export const userCounterOfferSettings = pgTable(
  'user_counter_offer_settings',
  {
    userId: text('user_id').primaryKey(), // Telegram user ID
    isEnabled: boolean('is_enabled').default(false).notNull(), // Feature toggle
    priceThreshold: real('price_threshold').default(0.5).notNull(), // Max price difference to trigger (e.g., 0.50 = 50 cents)
    messageTemplateId: integer('message_template_id').default(1).notNull(), // Which template to use (1, 2, or 3)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
);
