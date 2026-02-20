export interface DelayDefaults {
  delayMin: number;
  delayMax: number;
}

export abstract class BotPreferenceRepository {
  /**
   * Get bot preference for a user
   * Returns true if enabled, false if disabled
   * Default is false if no record exists
   */
  abstract getBotStatus(userId: string): Promise<boolean>;

  /**
   * Set bot preference for a user
   * Creates or updates the record
   */
  abstract setBotStatus(userId: string, isEnabled: boolean): Promise<void>;

  /**
   * Get global delay defaults for a user
   * Returns { delayMin: 0, delayMax: 0 } if no record exists
   */
  abstract getDelayDefaults(userId: string): Promise<DelayDefaults>;

  /**
   * Set global delay defaults for a user
   */
  abstract setDelayDefaults(userId: string, delayMin: number, delayMax: number): Promise<void>;
}
