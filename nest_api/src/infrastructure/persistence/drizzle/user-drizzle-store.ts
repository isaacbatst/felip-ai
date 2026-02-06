import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { UserRepository, UserData } from '../user.repository';
import { users } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

@Injectable()
export class UserDrizzleStore extends UserRepository {
  private readonly logger = new Logger(UserDrizzleStore.name);

  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  async createUser(params: {
    phone: string;
    telegramUserId: number;
    chatId: number;
  }): Promise<UserData> {
    const result = await this.db
      .insert(users)
      .values({
        phone: params.phone,
        telegramUserId: params.telegramUserId,
        chatId: params.chatId,
      })
      .returning();

    this.logger.log(`Created user for phone: ${params.phone}, telegramUserId: ${params.telegramUserId}`);

    return result[0];
  }

  async findByPhone(phone: string): Promise<UserData | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  async findByTelegramUserId(telegramUserId: number): Promise<UserData | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  async updateChatId(telegramUserId: number, chatId: number): Promise<void> {
    await this.db
      .update(users)
      .set({ chatId, updatedAt: new Date() })
      .where(eq(users.telegramUserId, telegramUserId));
  }
}
