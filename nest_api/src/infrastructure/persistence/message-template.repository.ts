export type MessageTemplateType = 'counter_offer' | 'cta' | 'closing';

export interface MessageTemplate {
  id: number;
  userId: string;
  type: MessageTemplateType;
  body: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMessageTemplateInput {
  type: MessageTemplateType;
  body: string;
}

export interface UpdateMessageTemplateInput {
  body?: string;
  isActive?: boolean;
}

export abstract class MessageTemplateRepository {
  abstract findByUserAndType(userId: string, type: MessageTemplateType): Promise<MessageTemplate[]>;
  abstract findActiveByUserAndType(userId: string, type: MessageTemplateType): Promise<MessageTemplate[]>;
  abstract findById(id: number): Promise<MessageTemplate | null>;
  abstract countByUserAndType(userId: string, type: MessageTemplateType): Promise<number>;
  abstract create(userId: string, input: CreateMessageTemplateInput): Promise<MessageTemplate>;
  abstract update(id: number, input: UpdateMessageTemplateInput): Promise<MessageTemplate>;
  abstract deleteById(id: number): Promise<void>;
  abstract deleteAllByUserAndType(userId: string, type: MessageTemplateType): Promise<void>;
}
