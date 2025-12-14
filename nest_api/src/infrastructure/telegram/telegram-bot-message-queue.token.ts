import { Queue } from './interfaces/queue.interface';
import type { Context } from 'grammy';

/**
 * Concrete class token for injecting Queue<Context> implementation for Telegram bot messages
 * Allows easy swapping of queue implementations (in-memory, Redis, RabbitMQ, etc.)
 * Used as a DI token instead of a symbol
 */
export abstract class TelegramBotMessageQueue extends Queue<Context> {}
