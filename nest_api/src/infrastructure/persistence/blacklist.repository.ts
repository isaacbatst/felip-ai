export type BlacklistScope = 'group' | 'private' | 'both';

export interface BlacklistedUser {
  id: number;
  userId: string;
  blockedTelegramUserId: number;
  blockedUsername: string | null;
  blockedName: string | null;
  scope: BlacklistScope;
  createdAt: Date;
}

export interface AddToBlacklistInput {
  blockedTelegramUserId: number;
  blockedUsername: string | null;
  blockedName: string | null;
  scope: BlacklistScope;
}

export abstract class BlacklistRepository {
  abstract getBlacklist(userId: string): Promise<BlacklistedUser[]>;
  abstract isBlocked(userId: string, blockedTelegramUserId: number, scope: 'group' | 'private'): Promise<boolean>;
  abstract add(userId: string, input: AddToBlacklistInput): Promise<BlacklistedUser>;
  abstract remove(userId: string, id: number): Promise<void>;
}
