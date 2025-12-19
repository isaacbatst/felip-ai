/**
 * Type definitions for TDLib updates
 * Based on TDLib update structure
 */

/**
 * Base structure for all TDLib updates
 */
export interface TdlibUpdate {
  _: string;
  [key: string]: unknown;
}

/**
 * TDLib updateNewMessage structure
 */
export interface TdlibUpdateNewMessage extends TdlibUpdate {
  _: 'updateNewMessage';
  message?: {
    id?: number;
    chat_id?: number;
    content?: {
      _?: string;
      text?: {
        _?: string;
        text?: string;
      };
      [key: string]: unknown;
    };
    sender_id?: {
      _?: string;
      user_id?: number;
      [key: string]: unknown;
    };
    date?: number;
    [key: string]: unknown;
  };
}

/**
 * TDLib updateAuthorizationState structure
 */
export interface TdlibUpdateAuthorizationState extends TdlibUpdate {
  _: 'updateAuthorizationState';
  authorization_state?: {
    _?: string;
    [key: string]: unknown;
  };
}

/**
 * Union type for all TDLib update types
 */
export type TdlibUpdateType = TdlibUpdateNewMessage | TdlibUpdateAuthorizationState | TdlibUpdate;

import { TelegramUserInfo } from './telegram-user-info.types';

/**
 * Job data structure for tdlib-updates queue
 */
export interface TdlibUpdateJobData {
  update?: TdlibUpdateType;
  requestId?: string;
  userId?: string; // Bot user ID (string) - identifies which bot user owns this worker (legacy, use botUserId)
  botUserId?: string; // Bot user ID (string) - identifies which bot user owns this worker
  telegramBotUserId?: number; // Telegram bot user ID (number) - the bot user ID from Telegram context
  chatId?: number;
  phoneNumber?: string;
  retry?: boolean;
  userInfo?: TelegramUserInfo | null;
  error?: string;
  state?: 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed';
  // Command response fields
  commandType?: string;
  result?: unknown;
  context?: import('@felip-ai/shared-types').CommandContext;
}
