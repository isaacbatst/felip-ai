import { Queue } from './interfaces/queue.interface';
import { QueuedMessage } from './interfaces/queued-message';

/**
 * Concrete class token for injecting Queue<QueuedMessage> implementation
 * Allows easy swapping of queue implementations (in-memory, Redis, RabbitMQ, etc.)
 * Used as a DI token instead of a symbol
 */
export abstract class TelegramUserMessageQueue extends Queue<QueuedMessage> {}

