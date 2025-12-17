import { Queue } from '../interfaces/queue.interface';
import { QueuedMessage } from '../../telegram/interfaces/queued-message';

/**
 * Abstract token for injecting Queue<QueuedMessage> implementation
 * Allows easy swapping of queue implementations (in-memory, Redis/Bull, RabbitMQ, etc.)
 * Used as a DI token instead of a symbol
 */
export abstract class TelegramUserMessageQueue extends Queue<QueuedMessage> {}



