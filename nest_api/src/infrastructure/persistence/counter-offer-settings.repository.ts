/**
 * Counter offer settings data structure
 */
export interface CounterOfferSettings {
  userId: string;
  isEnabled: boolean;
  priceThreshold: number;
  messageTemplateId: number;
  callToActionTemplateId: number;
  dedupEnabled: boolean;
  dedupWindowMinutes: number;
  groupDedupEnabled: boolean;
  groupDedupWindowMinutes: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Counter offer settings input (for create/update)
 */
export interface CounterOfferSettingsInput {
  isEnabled: boolean;
  priceThreshold: number;
  messageTemplateId: number;
  callToActionTemplateId: number;
  dedupEnabled: boolean;
  dedupWindowMinutes: number;
  groupDedupEnabled: boolean;
  groupDedupWindowMinutes: number;
}

/**
 * Abstract repository for counter offer settings operations
 * Manages user preferences for the private counter offer feature
 */
export abstract class CounterOfferSettingsRepository {
  /**
   * Get counter offer settings for a user
   * Returns null if no settings exist (feature not configured)
   */
  abstract getSettings(userId: string): Promise<CounterOfferSettings | null>;

  /**
   * Upsert counter offer settings for a user
   * Creates or updates the record
   */
  abstract upsertSettings(userId: string, settings: CounterOfferSettingsInput): Promise<CounterOfferSettings>;
}
