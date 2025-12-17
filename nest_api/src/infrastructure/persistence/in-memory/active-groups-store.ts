import { InMemoryStore } from "@/infrastructure/persistence/in-memory/in-memory-store";
import { ActiveGroupsRepository } from "../active-groups.repository";

export class ActiveGroupsStore extends InMemoryStore<number[]> implements ActiveGroupsRepository {
  async getActiveGroups(userId: string): Promise<number[] | null> {
    return this.get(userId) ?? null;
  }

  async setActiveGroups(userId: string, groups: number[]): Promise<void> {
    this.set(userId, groups);
  }

  async removeActiveGroup(userId: string, groupId: number): Promise<void> {
    const groups = await this.getActiveGroups(userId);
    if(!groups) {
      return;
    }
    this.setActiveGroups(userId, groups.filter((id) => id !== groupId));
  }

  async addActiveGroup(userId: string, groupId: number): Promise<void> {
    const groups = await this.getActiveGroups(userId);
    if(!groups) {
      return;
    }
    this.setActiveGroups(userId, [...groups, groupId]);
  }
}