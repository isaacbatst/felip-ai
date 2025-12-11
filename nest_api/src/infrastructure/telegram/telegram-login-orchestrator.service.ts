import { Injectable } from '@nestjs/common';
import { PhoneWhitelistService } from './phone-whitelist.service';
import { TelegramUserLoginHandler, type TelegramUserInfo } from './telegram-user-login-handler';

/**
 * Service responsável por orquestrar o processo de login do Telegram
 * Single Responsibility: apenas coordenação entre bot e user client para login
 * Composition: usa PhoneWhitelistService e TelegramUserLoginHandler
 */
@Injectable()
export class TelegramLoginOrchestratorService {
  constructor(
    private readonly phoneWhitelist: PhoneWhitelistService,
    private readonly loginHandler: TelegramUserLoginHandler,
  ) {}

  /**
   * Valida se um número de telefone está na whitelist
   * @param phoneNumber Número de telefone em formato internacional
   * @returns true se está na whitelist, false caso contrário
   */
  isPhoneNumberAllowed(phoneNumber: string): boolean {
    return this.phoneWhitelist.isAllowed(phoneNumber);
  }

  /**
   * Realiza o login com um número de telefone
   * @param phoneNumber Número de telefone em formato internacional
   * @returns Informações do usuário após login bem-sucedido
   * @throws Error se o número não está na whitelist ou se o login falhar
   */
  async performLogin(phoneNumber: string): Promise<TelegramUserInfo> {
    if (!this.isPhoneNumberAllowed(phoneNumber)) {
      throw new Error('Phone number not in whitelist');
    }

    return await this.loginHandler.login(phoneNumber);
  }
}

