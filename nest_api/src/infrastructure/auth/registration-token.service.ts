import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

interface TokenData {
  telegramUserId: number;
  chatId: number;
  createdAt: number;
}

@Injectable()
export class RegistrationTokenService {
  private readonly tokens = new Map<string, TokenData>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  create(telegramUserId: number, chatId: number): string {
    this.cleanExpired();
    const token = randomUUID();
    this.tokens.set(token, { telegramUserId, chatId, createdAt: Date.now() });
    return token;
  }

  consume(token: string): { telegramUserId: number; chatId: number } | null {
    const data = this.tokens.get(token);
    if (!data) return null;

    this.tokens.delete(token);

    if (Date.now() - data.createdAt > this.TTL_MS) return null;

    return { telegramUserId: data.telegramUserId, chatId: data.chatId };
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.tokens) {
      if (now - value.createdAt > this.TTL_MS) {
        this.tokens.delete(key);
      }
    }
  }
}
