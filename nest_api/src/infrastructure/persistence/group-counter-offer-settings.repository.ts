export interface GroupCounterOfferSetting {
  userId: string;
  groupId: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupCounterOfferSettingInput {
  isEnabled: boolean;
}

export abstract class GroupCounterOfferSettingsRepository {
  abstract getGroupSetting(userId: string, groupId: number): Promise<GroupCounterOfferSetting | null>;
  abstract getAllGroupSettings(userId: string): Promise<GroupCounterOfferSetting[]>;
  abstract upsertGroupSetting(userId: string, groupId: number, input: GroupCounterOfferSettingInput): Promise<GroupCounterOfferSetting>;
  abstract deleteGroupSetting(userId: string, groupId: number): Promise<void>;
}
