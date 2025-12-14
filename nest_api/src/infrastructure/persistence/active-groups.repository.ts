export abstract class ActiveGroupsRepository {
  abstract getActiveGroups(userId: string): Promise<number[] | null>;
  abstract setActiveGroups(userId: string, groups: number[]): Promise<void>;
  abstract removeActiveGroup(userId: string, groupId: number): Promise<void>;
  abstract addActiveGroup(userId: string, groupId: number): Promise<void>;
}