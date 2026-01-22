export abstract class BotStatusRepository {
  /**
   * Get bot status for a user
   * Returns true if enabled, false if disabled
   * Default is true if no record exists
   */
  abstract getBotStatus(userId: string): Promise<boolean>;
  
  /**
   * Set bot status for a user
   * Creates or updates the record
   */
  abstract setBotStatus(userId: string, isEnabled: boolean): Promise<void>;
}
