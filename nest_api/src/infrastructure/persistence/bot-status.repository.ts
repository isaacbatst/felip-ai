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

  abstract setWorkerStartingAt(userId: string): Promise<void>;
  abstract clearWorkerStartingAt(userId: string): Promise<void>;
  abstract getWorkerStartingAt(userId: string): Promise<Date | null>;

  abstract setLastAuthError(userId: string, error: string): Promise<void>;
  abstract clearLastAuthError(userId: string): Promise<void>;
  abstract getLastAuthError(userId: string): Promise<string | null>;
}
