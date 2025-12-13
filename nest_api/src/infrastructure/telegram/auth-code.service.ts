import { Injectable } from '@nestjs/common';

/**
 * Service responsável por gerenciar promises pendentes de auth code
 * Single Responsibility: apenas gerenciamento de promises de auth code
 */
@Injectable()
export class AuthCodeService {
  private readonly pendingAuthCodes: Map<
    number,
    {
      resolve: (code: string) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  /**
   * Registra uma promise pendente de auth code para um usuário
   * @param userId ID do usuário
   * @returns Promise que será resolvida quando o código for recebido
   */
  waitForAuthCode(userId: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Remove qualquer promise pendente anterior
      this.pendingAuthCodes.delete(userId);

      // Registra a nova promise
      this.pendingAuthCodes.set(userId, { resolve, reject });

      // Timeout após 5 minutos
      setTimeout(() => {
        if (this.pendingAuthCodes.has(userId)) {
          this.pendingAuthCodes.delete(userId);
          reject(new Error('Auth code timeout'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Resolve a promise pendente de auth code para um usuário
   * @param userId ID do usuário
   * @param code Código de autenticação
   * @returns true se havia uma promise pendente e foi resolvida, false caso contrário
   */
  provideAuthCode(userId: number, code: string): boolean {
    const pending = this.pendingAuthCodes.get(userId);
    if (pending) {
      this.pendingAuthCodes.delete(userId);
      pending.resolve(code);
      return true;
    }
    return false;
  }

  /**
   * Rejeita a promise pendente de auth code para um usuário
   * @param userId ID do usuário
   * @param error Erro a ser rejeitado
   */
  rejectAuthCode(userId: number, error: Error): void {
    const pending = this.pendingAuthCodes.get(userId);
    if (pending) {
      this.pendingAuthCodes.delete(userId);
      pending.reject(error);
    }
  }

  /**
   * Verifica se há uma promise pendente de auth code para um usuário
   * @param userId ID do usuário
   * @returns true se há uma promise pendente, false caso contrário
   */
  hasPendingAuthCode(userId: number): boolean {
    return this.pendingAuthCodes.has(userId);
  }

  /**
   * Remove qualquer promise pendente de auth code para um usuário
   * @param userId ID do usuário
   */
  clearPendingAuthCode(userId: number): void {
    this.pendingAuthCodes.delete(userId);
  }
}

