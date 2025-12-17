/**
 * Estados possíveis de uma conversa
 */
export enum ConversationState {
  IDLE = 'idle',
  WAITING_PHONE_NUMBER = 'waiting_phone_number',
  WAITING_AUTH_CODE = 'waiting_auth_code',
}

/**
 * Login session data structure
 */
export interface LoginSessionData {
  userId: number;
  phoneNumber: string;
  chatId: number;
  requestId: string;
  state: 'waitingPhone' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed';
}

/**
 * Abstract repository for conversation state operations and login sessions
 */
export abstract class ConversationRepository {
  /**
   * Define o estado de uma conversa para um usuário
   */
  abstract setState(userId: number, state: ConversationState): Promise<void>;

  /**
   * Obtém o estado atual de uma conversa para um usuário
   */
  abstract getState(userId: number): Promise<ConversationState>;

  /**
   * Remove o estado de uma conversa (volta para IDLE)
   */
  abstract clearState(userId: number): Promise<void>;

  /**
   * Define o requestId pendente de auth code para um usuário
   */
  abstract setPendingAuthCodeRequestId(userId: number, requestId: string): Promise<void>;

  /**
   * Obtém o requestId pendente de auth code para um usuário
   */
  abstract getPendingAuthCodeRequestId(userId: number): Promise<string | undefined>;

  /**
   * Verifica se há um requestId pendente de auth code para um usuário
   */
  abstract hasPendingAuthCodeRequestId(userId: number): Promise<boolean>;

  /**
   * Remove o requestId pendente de auth code para um usuário
   */
  abstract clearPendingAuthCodeRequestId(userId: number): Promise<void>;

  /**
   * Store a login session
   */
  abstract setLoginSession(session: LoginSessionData): Promise<void>;

  /**
   * Get a login session by requestId
   */
  abstract getLoginSession(requestId: string): Promise<LoginSessionData | null>;

  /**
   * Get a login session by userId
   */
  abstract getLoginSessionByUserId(userId: number): Promise<LoginSessionData | null>;

  /**
   * Update login session state
   */
  abstract updateLoginSessionState(
    requestId: string,
    state: LoginSessionData['state'],
  ): Promise<void>;

  /**
   * Delete a login session
   */
  abstract deleteLoginSession(requestId: string): Promise<void>;

  /**
   * Check if a login session exists
   */
  abstract loginSessionExists(requestId: string): Promise<boolean>;
}
