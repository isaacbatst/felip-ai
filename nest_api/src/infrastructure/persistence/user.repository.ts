export interface UserData {
  id: number;
  phone: string;
  telegramUserId: number;
  chatId: number;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class UserRepository {
  abstract createUser(params: {
    phone: string;
    telegramUserId: number;
    chatId: number;
  }): Promise<UserData>;

  abstract findByPhone(phone: string): Promise<UserData | null>;

  abstract findByTelegramUserId(telegramUserId: number): Promise<UserData | null>;

  abstract updateChatId(telegramUserId: number, chatId: number): Promise<void>;
}
