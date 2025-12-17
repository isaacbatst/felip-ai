import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@/config/app.config';

/**
 * Service responsável por gerenciar a whitelist de números de telefone
 * Single Responsibility: apenas validação de números permitidos
 */
@Injectable()
export class PhoneWhitelistService {
  private readonly whitelist: Set<string>;

  constructor(private readonly appConfig: AppConfigService) {
    // Initialize whitelist with the phone number from config
    const defaultPhones = this.appConfig.getTelegramPhones();
    this.whitelist = new Set(defaultPhones);
  }

  /**
   * Verifica se um número de telefone está na whitelist
   * @param phoneNumber Número de telefone em formato internacional (ex: +5511999999999)
   * @returns true se o número está na whitelist, false caso contrário
   */
  isAllowed(phoneNumber: string): boolean {
    // Normalize phone number by removing spaces and ensuring it starts with +
    const normalized = phoneNumber.trim().replace(/\s+/g, '');
    return this.whitelist.has(normalized);
  }

  /**
   * Adiciona um número à whitelist
   * @param phoneNumber Número de telefone em formato internacional
   */
  addPhoneNumber(phoneNumber: string): void {
    const normalized = phoneNumber.trim().replace(/\s+/g, '');
    this.whitelist.add(normalized);
  }

  /**
   * Remove um número da whitelist
   * @param phoneNumber Número de telefone em formato internacional
   */
  removePhoneNumber(phoneNumber: string): void {
    const normalized = phoneNumber.trim().replace(/\s+/g, '');
    this.whitelist.delete(normalized);
  }

  /**
   * Retorna todos os números da whitelist
   */
  getAllowedNumbers(): string[] {
    return Array.from(this.whitelist);
  }
}

