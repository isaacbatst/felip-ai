import { TdlibUpdateType } from '../../tdlib/tdlib-update.types';

/**
 * Message data structure for queue processing
 * Contains the full TDLib update object to be processed
 */
export interface QueuedMessage {
  update: TdlibUpdateType;
  userId?: string; // Bot user ID (from ctx.from.id) - identifies which user's worker sent this update
}
