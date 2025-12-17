import { Queue } from '../interfaces/queue.interface';
import type { Context } from 'grammy';

/**
 * Abstract token for injecting Queue<Context> implementation for Telegram bot messages
 * Allows easy swapping of queue implementations (in-memory, Redis/Bull, RabbitMQ, etc.)
 * Used as a DI token instead of a symbol
 */
export abstract class TelegramBotMessageQueue extends Queue<Context['update']['message']> {}



