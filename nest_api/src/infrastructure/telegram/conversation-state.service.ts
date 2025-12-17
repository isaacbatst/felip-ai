import { Injectable } from '@nestjs/common';
import { ConversationRepository, ConversationState } from '@/infrastructure/persistence/conversation.repository';

// Re-export ConversationState for backward compatibility
export { ConversationState };

/**
 * Service responsável por gerenciar o estado das conversas
 * Single Responsibility: apenas gerenciamento de estado de conversas
 */
@Injectable()
export class ConversationStateService {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  /**
   * Define o estado de uma conversa para um usuário
   */
  async setState(userId: number, state: ConversationState): Promise<void> {
    await this.conversationRepository.setState(userId, state);
  }

  /**
   * Obtém o estado atual de uma conversa para um usuário
   */
  async getState(userId: number): Promise<ConversationState> {
    return await this.conversationRepository.getState(userId);
  }

  /**
   * Remove o estado de uma conversa (volta para IDLE)
   */
  async clearState(userId: number): Promise<void> {
    await this.conversationRepository.clearState(userId);
  }

  /**
   * Verifica se um usuário está em um estado específico
   */
  async isInState(userId: number, state: ConversationState): Promise<boolean> {
    const currentState = await this.getState(userId);
    return currentState === state;
  }

  /**
   * Define o requestId pendente de auth code para um usuário
   */
  async setPendingAuthCodeRequestId(userId: number, requestId: string): Promise<void> {
    await this.conversationRepository.setPendingAuthCodeRequestId(userId, requestId);
  }

  /**
   * Obtém o requestId pendente de auth code para um usuário
   */
  async getPendingAuthCodeRequestId(userId: number): Promise<string | undefined> {
    return await this.conversationRepository.getPendingAuthCodeRequestId(userId);
  }

  /**
   * Verifica se há um requestId pendente de auth code para um usuário
   */
  async hasPendingAuthCodeRequestId(userId: number): Promise<boolean> {
    return await this.conversationRepository.hasPendingAuthCodeRequestId(userId);
  }

  /**
   * Remove o requestId pendente de auth code para um usuário
   */
  async clearPendingAuthCodeRequestId(userId: number): Promise<void> {
    await this.conversationRepository.clearPendingAuthCodeRequestId(userId);
  }
}

