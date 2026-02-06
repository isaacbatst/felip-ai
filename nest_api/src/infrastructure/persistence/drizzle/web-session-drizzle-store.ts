import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  WebSessionRepository,
  WebSessionValidationResult,
} from '../web-session.repository';
import { webSessions } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class WebSessionDrizzleStore extends WebSessionRepository {
  private readonly logger = new Logger(WebSessionDrizzleStore.name);
  private readonly ttlDays = 30;

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private generateToken(): string {
    return randomBytes(24).toString('hex');
  }

  private getExpiresAt(): Date {
    return new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const id = randomUUID();
    const token = this.generateToken();
    const expiresAt = this.getExpiresAt();

    await this.db.insert(webSessions).values({
      id,
      userId,
      token,
      expiresAt,
    });

    this.logger.log(`Created web session for userId: ${userId}, expires at: ${expiresAt.toISOString()}`);

    return { token, expiresAt };
  }

  async validateSession(token: string): Promise<WebSessionValidationResult> {
    const result = await this.db
      .select()
      .from(webSessions)
      .where(eq(webSessions.token, token))
      .limit(1);

    if (result.length === 0) {
      return { valid: false };
    }

    const session = result[0];

    if (session.expiresAt < new Date()) {
      return { valid: false };
    }

    return { valid: true, userId: session.userId };
  }

  async refreshSession(token: string): Promise<void> {
    const expiresAt = this.getExpiresAt();

    await this.db
      .update(webSessions)
      .set({ expiresAt, updatedAt: new Date() })
      .where(eq(webSessions.token, token));
  }

  async deleteSession(token: string): Promise<void> {
    await this.db
      .delete(webSessions)
      .where(eq(webSessions.token, token));
  }

  async deleteSessionsByUserId(userId: string): Promise<void> {
    await this.db
      .delete(webSessions)
      .where(eq(webSessions.userId, userId));
  }

  async cleanupExpiredSessions(): Promise<void> {
    const result = await this.db
      .delete(webSessions)
      .where(lt(webSessions.expiresAt, new Date()))
      .returning({ id: webSessions.id });

    if (result.length > 0) {
      this.logger.log(`Cleaned up ${result.length} expired web sessions`);
    }
  }
}
