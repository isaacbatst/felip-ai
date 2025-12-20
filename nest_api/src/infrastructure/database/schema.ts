import { pgTable, text, integer, bigint, timestamp, index, unique } from 'drizzle-orm/pg-core';

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
  (table) => ({
    telegramUserIdIdx: index('sessions_telegram_user_id_idx').on(table.telegramUserId),
    loggedInUserIdIdx: index('sessions_logged_in_user_id_idx').on(table.loggedInUserId),
    stateIdx: index('sessions_state_idx').on(table.state),
  }),
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
  (table) => ({
    userIdIdx: index('active_groups_user_id_idx').on(table.userId),
    userIdGroupIdIdx: index('active_groups_user_id_group_id_idx').on(table.userId, table.groupId),
    userIdGroupIdUnique: unique('active_groups_user_id_group_id_unique').on(table.userId, table.groupId),
  }),
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

