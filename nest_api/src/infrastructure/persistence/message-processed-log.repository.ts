/**
 * Message processed log data structure
 */
export interface MessageProcessedLogData {
  queueName: string;
  messageData: unknown; // JSON data
  userId?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  retryCount?: number;
}

/**
 * Abstract repository for message processed log operations
 */
export abstract class MessageProcessedLogRepository {
  /**
   * Log a processed message
   */
  abstract logProcessedMessage(log: MessageProcessedLogData): Promise<void>;
}

