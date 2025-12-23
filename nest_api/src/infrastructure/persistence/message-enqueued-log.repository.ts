/**
 * Message enqueued log data structure
 */
export interface MessageEnqueuedLogData {
  queueName: string;
  messageData: unknown; // JSON data
  userId?: string;
}

/**
 * Abstract repository for message enqueued log operations
 */
export abstract class MessageEnqueuedLogRepository {
  /**
   * Log an enqueued message
   */
  abstract logEnqueuedMessage(log: MessageEnqueuedLogData): Promise<void>;
}

