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
}
