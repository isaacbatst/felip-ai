/**
 * Message data structure for queue processing
 * Contains the full update object to be processed
 */
export interface QueuedMessage {
  update: unknown;
}
