export interface GroupDelaySetting {
  userId: string;
  groupId: number;
  delayEnabled: boolean;
  delayMin: number | null;
  delayMax: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupDelaySettingInput {
  delayEnabled: boolean;
  delayMin: number | null;
  delayMax: number | null;
}

export abstract class GroupDelaySettingsRepository {
  abstract getGroupDelaySetting(userId: string, groupId: number): Promise<GroupDelaySetting | null>;
  abstract getAllGroupDelaySettings(userId: string): Promise<GroupDelaySetting[]>;
  abstract upsertGroupDelaySetting(userId: string, groupId: number, input: GroupDelaySettingInput): Promise<GroupDelaySetting>;
}
