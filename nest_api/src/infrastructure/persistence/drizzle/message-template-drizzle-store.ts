import { Injectable, Inject } from '@nestjs/common';
import { eq, and, asc, count } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  MessageTemplateRepository,
  type MessageTemplate,
  type MessageTemplateType,
  type CreateMessageTemplateInput,
  type UpdateMessageTemplateInput,
} from '../message-template.repository';
import { userMessageTemplates } from '@/infrastructure/database/schema';
import type * as schema from '@/infrastructure/database/schema';

type DrizzleRow = typeof userMessageTemplates.$inferSelect;

@Injectable()
export class MessageTemplateDrizzleStore extends MessageTemplateRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
  }

  private toMessageTemplate(row: DrizzleRow): MessageTemplate {
    return {
      ...row,
      type: row.type as MessageTemplateType,
    };
  }

  async findByUserAndType(userId: string, type: MessageTemplateType): Promise<MessageTemplate[]> {
    const rows = await this.db
      .select()
      .from(userMessageTemplates)
      .where(and(eq(userMessageTemplates.userId, userId), eq(userMessageTemplates.type, type)))
      .orderBy(asc(userMessageTemplates.createdAt));
    return rows.map(this.toMessageTemplate);
  }

  async findActiveByUserAndType(userId: string, type: MessageTemplateType): Promise<MessageTemplate[]> {
    const rows = await this.db
      .select()
      .from(userMessageTemplates)
      .where(
        and(
          eq(userMessageTemplates.userId, userId),
          eq(userMessageTemplates.type, type),
          eq(userMessageTemplates.isActive, true),
        ),
      )
      .orderBy(asc(userMessageTemplates.createdAt));
    return rows.map(this.toMessageTemplate);
  }

  async findById(id: number): Promise<MessageTemplate | null> {
    const result = await this.db
      .select()
      .from(userMessageTemplates)
      .where(eq(userMessageTemplates.id, id))
      .limit(1);
    return result[0] ? this.toMessageTemplate(result[0]) : null;
  }

  async countByUserAndType(userId: string, type: MessageTemplateType): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(userMessageTemplates)
      .where(and(eq(userMessageTemplates.userId, userId), eq(userMessageTemplates.type, type)));
    return result[0].count;
  }

  async create(userId: string, input: CreateMessageTemplateInput): Promise<MessageTemplate> {
    const now = new Date();
    const result = await this.db
      .insert(userMessageTemplates)
      .values({
        userId,
        type: input.type,
        body: input.body,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return this.toMessageTemplate(result[0]);
  }

  async update(id: number, input: UpdateMessageTemplateInput): Promise<MessageTemplate> {
    const result = await this.db
      .update(userMessageTemplates)
      .set({
        ...(input.body !== undefined && { body: input.body }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        updatedAt: new Date(),
      })
      .where(eq(userMessageTemplates.id, id))
      .returning();
    return this.toMessageTemplate(result[0]);
  }

  async deleteById(id: number): Promise<void> {
    await this.db.delete(userMessageTemplates).where(eq(userMessageTemplates.id, id));
  }

  async deleteAllByUserAndType(userId: string, type: MessageTemplateType): Promise<void> {
    await this.db
      .delete(userMessageTemplates)
      .where(and(eq(userMessageTemplates.userId, userId), eq(userMessageTemplates.type, type)));
  }
}
