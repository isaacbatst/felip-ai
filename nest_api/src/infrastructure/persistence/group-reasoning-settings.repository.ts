export type ReasoningMode = 'fast' | 'precise';

export interface GroupReasoningSetting {
  userId: string;
  groupId: number;
  reasoningMode: ReasoningMode;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupReasoningSettingInput {
  reasoningMode: ReasoningMode;
}

export abstract class GroupReasoningSettingsRepository {
  abstract getGroupReasoningSetting(userId: string, groupId: number): Promise<GroupReasoningSetting | null>;
  abstract getAllGroupReasoningSettings(userId: string): Promise<GroupReasoningSetting[]>;
  abstract upsertGroupReasoningSetting(userId: string, groupId: number, input: GroupReasoningSettingInput): Promise<GroupReasoningSetting>;
}
