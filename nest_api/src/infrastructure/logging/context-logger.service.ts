import { ConsoleLogger, Injectable, LoggerService } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_TRACE_ID, CLS_USER_ID, CLS_CHAT_ID, CLS_SENDER_ID } from './log-context';

@Injectable()
export class ContextLoggerService extends ConsoleLogger implements LoggerService {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private buildPrefix(): string {
    if (!this.cls.isActive()) return '';

    const parts: string[] = [];
    const traceId = this.cls.get(CLS_TRACE_ID);
    const userId = this.cls.get(CLS_USER_ID);
    const chatId = this.cls.get(CLS_CHAT_ID);
    const senderId = this.cls.get(CLS_SENDER_ID);

    if (traceId) parts.push(`t:${traceId}`);
    if (userId) parts.push(`u:${userId}`);
    if (chatId) parts.push(`c:${chatId}`);
    if (senderId) parts.push(`s:${senderId}`);

    return parts.length > 0 ? `[${parts.join(' ')}] ` : '';
  }

  log(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.log(`${prefix}${message}`, ...optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.error(`${prefix}${message}`, ...optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.warn(`${prefix}${message}`, ...optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.debug(`${prefix}${message}`, ...optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.verbose(`${prefix}${message}`, ...optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]) {
    const prefix = this.buildPrefix();
    super.fatal(`${prefix}${message}`, ...optionalParams);
  }
}
