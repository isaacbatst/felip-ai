import { Injectable } from '@nestjs/common';

/**
 * Estados possíveis de uma conversa
 */
export enum ConversationState {
  IDLE = 'idle',
  WAITING_PHONE_NUMBER = 'waiting_phone_number',
  WAITING_AUTH_CODE = 'waiting_auth_code',
}

/**
 * Service responsável por gerenciar o estado das conversas
 * Single Responsibility: apenas gerenciamento de estado de conversas
 */
@Injectable()
export class ConversationStateService {
  private readonly userStates: Map<number, ConversationState> = new Map();

  /**
   * Define o estado de uma conversa para um usuário
   */
  setState(userId: number, state: ConversationState): void {
    this.userStates.set(userId, state);
  }

  /**
   * Obtém o estado atual de uma conversa para um usuário
   */
  getState(userId: number): ConversationState {
    return this.userStates.get(userId) ?? ConversationState.IDLE;
  }

  /**
   * Remove o estado de uma conversa (volta para IDLE)
   */
  clearState(userId: number): void {
    this.userStates.delete(userId);
  }

  /**
   * Verifica se um usuário está em um estado específico
   */
  isInState(userId: number, state: ConversationState): boolean {
    return this.getState(userId) === state;
  }
}

