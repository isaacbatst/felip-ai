import { TelegramUserClient } from './telegram-user-client';

interface RabbitMQPublisher {
  publish(pattern: string, data: unknown): Promise<void>;
}

/**
 * Manages login sessions for queue-based login flow
 * Stateless: only tracks active requestIds, receives session data from queue payloads
 * Results are communicated via events to Nest API, not Promise resolution
 */
export class LoginSessionManager {
  // loggedInUserId from worker config (USER_ID env var) - used to identify which worker/user this session belongs to
  // This is the user ID that the worker is configured to impersonate
  private readonly loggedInUserId: string | null;
  private updatesPublisher: RabbitMQPublisher;

  constructor(
    private readonly client: TelegramUserClient,
    updatesPublisher: RabbitMQPublisher,
    loggedInUserId?: string,
  ) {
    this.updatesPublisher = updatesPublisher;
    this.loggedInUserId = loggedInUserId || null;
    this.setupAuthorizationStateHandler();
  }

  /**
   * Starts a login session by setting the phone number
   * Fire-and-forget: results are communicated via events to Nest API
   * Session is created in Nest API before dispatching login command
   * @param phoneNumber - Phone number to login with
   */
  async startLogin(
    phoneNumber: string,
  ): Promise<void> {
    // No need to track telegramUserId - loggedInUserId from config is used to identify the worker

    // Session is now created in Nest API before dispatching login command
    // No need to create it here

    // Set phone number using TDLib API directly
    this.setPhoneNumber(phoneNumber)
      .then(() => {
        // Phone number set successfully, wait for auth code request
        console.log(`[DEBUG] 📱 Phone number set: ${phoneNumber}`);
      })
      .catch((error) => {
        console.error(`[ERROR] Failed to set phone number:`, error);
        if (this.loggedInUserId) {
          // Dispatch failure event to Nest API (Nest API will look up active session by loggedInUserId)
          this.updatesPublisher.publish('login-failure', {
            botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
            error: error instanceof Error ? error.message : String(error),
          }).catch((err) => {
            console.error('[ERROR] Error enqueueing login failure event:', err);
          });
        }
      });
    }

  /**
   * Sets phone number using TDLib API
   */
  private async setPhoneNumber(phoneNumber: string): Promise<void> {
    await this.client.invokeDirect({
      _: 'setAuthenticationPhoneNumber',
      phone_number: phoneNumber,
    });
  }

  /**
   * Handles authorization state updates and requests auth codes when needed
   * Note: We dispatch events with loggedInUserId, and Nest API will look up session data from Redis
   */
  async handleAuthorizationState(update: unknown): Promise<void> {
    if (typeof update !== 'object' || update === null || !('authorization_state' in update)) {
      return;
    }

    const authState = (update as { authorization_state?: { _?: string } }).authorization_state?._;

    // Only process if loggedInUserId is available (identifies which worker/user)
    // Nest API will look up the active session by loggedInUserId (only one can be active at a time)
    if (!this.loggedInUserId) {
      return;
    }

    // Nest API will look up the active session by loggedInUserId
    // Only one login can be active at a time per user, so it will return the active one
    if (authState === 'authorizationStateWaitCode') {
      // Send auth code request to nest_api (Nest API will look up active session by loggedInUserId)
      await this.updatesPublisher.publish('auth-code-request', {
        botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
        retry: false,
      });
    } else if (authState === 'authorizationStateWaitPassword') {
      // Send password request to nest_api (Nest API will look up active session by loggedInUserId)
      await this.updatesPublisher.publish('password-request', {
        botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
      });
    } else if (authState === 'authorizationStateReady') {
      // Login completed - get user info and dispatch success event
      try {
        const userInfo = await this.client.getMe();
        // Dispatch login success event to nest_api (Nest API will look up active session by loggedInUserId)
        await this.updatesPublisher.publish('login-success', {
          botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
          userInfo,
        });
      } catch (error) {
        console.error(`[ERROR] Error getting user info after login:`, error);
        // Still dispatch success but without user info
        await this.updatesPublisher.publish('login-success', {
          botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
          userInfo: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (authState === 'authorizationStateClosed') {
      // Login failed or closed - dispatch failure event
      const error = new Error('Authorization closed');
      // Dispatch login failure event to nest_api (Nest API will look up active session by loggedInUserId)
      this.updatesPublisher.publish('login-failure', {
        botUserId: this.loggedInUserId, // Keep botUserId in payload for backward compatibility with nest_api
        error: error.message,
      }).catch((err) => {
        console.error('[ERROR] Error enqueueing login failure event:', err);
      });
    }
  }

  /**
   * Checks authentication code
   */
  private async checkAuthCode(code: string): Promise<void> {
    await this.client.invokeDirect({
      _: 'checkAuthenticationCode',
      code,
    });
  }

  /**
   * Checks authentication password
   */
  private async checkPassword(password: string): Promise<void> {
    await this.client.invokeDirect({
      _: 'checkAuthenticationPassword',
      password,
    });
  }

  /**
   * Provides auth code for a login session
   * Receives session data from queue payload (validated by Nest API)
   */
  async provideAuthCode(
    requestId: string,
    code: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<boolean> {
    // Validate state (defensive check, TDLib will also validate)
    if (sessionData.state !== 'waitingCode') {
      throw new Error(`Session is not in waitingCode state, current state: ${sessionData.state}`);
    }

    // No need to verify active requestId - TDLib will reject if invalid, and Nest API validates sessions
    try {
      await this.checkAuthCode(code);
      return true;
    } catch (error) {
      console.error(`[ERROR] Error checking auth code for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Provides password for a login session
   * Receives session data from queue payload (validated by Nest API)
   */
  async providePassword(
    requestId: string,
    password: string,
    sessionData: { userId: number; chatId: number; phoneNumber: string; state: string },
  ): Promise<boolean> {
    // Validate state (defensive check, TDLib will also validate)
    if (sessionData.state !== 'waitingPassword') {
      throw new Error(`Session is not in waitingPassword state, current state: ${sessionData.state}`);
    }

    // No need to verify active requestId - TDLib will reject if invalid, and Nest API validates sessions
    try {
      await this.checkPassword(password);
      return true;
    } catch (error) {
      console.error(`[ERROR] Error checking password for ${requestId}:`, error);
      throw error;
    }
  }

  /**
   * Sets up handler for authorization state updates
   * Note: UpdateHandler already publishes authorization state updates to the queue.
   * This handler only processes login-specific logic (requesting auth codes, etc.)
   */
  setupAuthorizationStateHandler(): void {
    this.client.onUpdate(async (update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateAuthorizationState') {
          // Handle authorization state for login sessions (triggers auth-code-request, etc.)
          // Note: UpdateHandler.setupHandlers() already publishes the raw update to the queue,
          // so we don't need to publish it again here to avoid duplicates.
          await this.handleAuthorizationState(update);
        }
      }
    });
  }
}
