import { Queue } from 'bullmq';
import { TelegramUserClient } from './telegram-user-client';

/**
 * Manages login sessions for queue-based login flow
 * Stateless: only tracks active requestIds, receives session data from queue payloads
 * Results are communicated via events to Nest API, not Promise resolution
 */
export class LoginSessionManager {
  // Track active requestIds (for matching authorization state updates)
  private activeRequestIds: Set<string> = new Set();
  private updatesQueue: Queue;

  constructor(
    private readonly client: TelegramUserClient,
    updatesQueue: Queue,
  ) {
    this.updatesQueue = updatesQueue;
    this.setupAuthorizationStateHandler();
  }

  /**
   * Starts a login session by setting the phone number
   * Fire-and-forget: results are communicated via events to Nest API
   */
  async startLogin(
    phoneNumber: string,
    userId: number,
    chatId: number,
    requestId: string,
  ): Promise<void> {
    this.activeRequestIds.add(requestId);

    // Dispatch session created event to Nest API for persistence
    this.updatesQueue.add('session-created', {
      requestId,
      userId,
      phoneNumber,
      chatId,
      state: 'waitingPhone',
    }).catch((error) => {
      console.error(`[ERROR] Failed to dispatch session-created event for ${requestId}:`, error);
      // Still continue with login flow
    });

    // Set phone number using TDLib API directly
    this.setPhoneNumber(phoneNumber)
      .then(() => {
        // Phone number set successfully, wait for auth code request
        console.log(`[DEBUG] 📱 Phone number set: ${phoneNumber}`);
      })
      .catch((error) => {
        console.error(`[ERROR] Failed to set phone number for ${requestId}:`, error);
        this.updateSessionState(requestId, 'failed', userId);
        // Dispatch failure event to Nest API
        this.updatesQueue.add('login-failure', {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }).catch((err) => {
          console.error('[ERROR] Error enqueueing login failure event:', err);
        });
        this.cleanupSession(requestId);
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
   * Note: We dispatch events with requestId, and Nest API will look up session data from Redis
   */
  async handleAuthorizationState(update: unknown): Promise<void> {
    if (typeof update !== 'object' || update === null || !('authorization_state' in update)) {
      return;
    }

    const authState = (update as { authorization_state?: { _?: string } }).authorization_state?._;

    // Process all active sessions (we only track requestIds, Nest API has the full session data)
    for (const requestId of Array.from(this.activeRequestIds)) {
      if (authState === 'authorizationStateWaitCode') {
        this.updateSessionState(requestId, 'waitingCode');
        // Send auth code request to nest_api (Nest API will look up session data)
        await this.updatesQueue.add('auth-code-request', {
          requestId,
          retry: false,
        });
      } else if (authState === 'authorizationStateWaitPassword') {
        this.updateSessionState(requestId, 'waitingPassword');
        // Send password request to nest_api (Nest API will look up session data)
        await this.updatesQueue.add('password-request', {
          requestId,
        });
      } else if (authState === 'authorizationStateReady') {
        // Login completed - get user info and dispatch success event
        this.updateSessionState(requestId, 'completed');
        try {
          const userInfo = await this.client.getMe();
          // Dispatch login success event to nest_api (Nest API will look up session data)
          await this.updatesQueue.add('login-success', {
            requestId,
            userInfo,
          });
        } catch (error) {
          console.error(`[ERROR] Error getting user info after login for ${requestId}:`, error);
          // Still dispatch success but without user info
          await this.updatesQueue.add('login-success', {
            requestId,
            userInfo: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        this.cleanupSession(requestId);
      } else if (authState === 'authorizationStateClosed') {
        // Login failed or closed - dispatch failure event
        this.updateSessionState(requestId, 'failed');
        const error = new Error('Authorization closed');
        // Dispatch login failure event to nest_api (Nest API will look up session data)
        await this.updatesQueue.add('login-failure', {
          requestId,
          error: error.message,
        }).catch((err) => {
          console.error('[ERROR] Error enqueueing login failure event:', err);
        });
        this.cleanupSession(requestId);
      }
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

    // Ensure requestId is active
    if (!this.activeRequestIds.has(requestId)) {
      throw new Error(`No active login session found for requestId: ${requestId}`);
    }

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

    // Ensure requestId is active
    if (!this.activeRequestIds.has(requestId)) {
      throw new Error(`No active login session found for requestId: ${requestId}`);
    }

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
   */
  setupAuthorizationStateHandler(): void {
    this.client.onUpdate(async (update: unknown) => {
      if (typeof update === 'object' && update !== null && '_' in update) {
        const updateType = (update as { _: string })._;
        if (updateType === 'updateAuthorizationState') {
          // Handle authorization state for login sessions
          await this.handleAuthorizationState(update);

          // Also send to nest_api
          this.updatesQueue
            .add('authorization-state', { update })
            .catch((error: unknown) => {
              console.error('[ERROR] Error enqueueing authorization state update:', error);
            });
        }
      }
    });
  }

  /**
   * Cancels a login session
   */
  async cancelSession(requestId: string): Promise<void> {
    // Dispatch login failure event for cancellation
    await this.updatesQueue.add('login-failure', {
      requestId,
      error: 'Login cancelled',
    }).catch((error) => {
      console.error(`[ERROR] Failed to dispatch login-failure event for ${requestId}:`, error);
    });
    
    // Dispatch session deleted event to Nest API (Nest API will look up session data)
    await this.updatesQueue.add('session-deleted', {
      requestId,
    }).catch((error) => {
      console.error(`[ERROR] Failed to dispatch session-deleted event for ${requestId}:`, error);
    });
    
    this.cleanupSession(requestId);
  }

  /**
   * Updates session state and dispatches event to Nest API
   */
  private updateSessionState(requestId: string, state: string, userId?: number): void {
    // Dispatch session state update event to Nest API for persistence
    this.updatesQueue.add('session-state-updated', {
      requestId,
      userId,
      state,
    }).catch((error) => {
      console.error(`[ERROR] Failed to dispatch session-state-updated event for ${requestId}:`, error);
    });
  }

  /**
   * Cleanup session from memory (active requestIds)
   */
  private cleanupSession(requestId: string): void {
    // Dispatch session deleted event to Nest API (Nest API will look up session data)
    this.updatesQueue.add('session-deleted', {
      requestId,
    }).catch((error) => {
      console.error(`[ERROR] Failed to dispatch session-deleted event for ${requestId}:`, error);
    });
    this.activeRequestIds.delete(requestId);
  }
}
