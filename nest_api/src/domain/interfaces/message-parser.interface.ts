import { Injectable } from '@nestjs/common';
import type { PurchaseRequest } from '../types/purchase.types';

/**
 * Opção de programa de milhas para o parser
 */
export interface ProgramOption {
  id: number;
  name: string;
}

/**
 * Classe abstrata para parsing de mensagens (ISP - Interface Segregation Principle)
 * Apenas expõe o que é necessário
 * Pode ser usada como provider token no NestJS
 */
@Injectable()
export abstract class MessageParser {
  /**
   * Faz parsing de uma mensagem de texto para identificar se é uma proposta de compra
   * @param text Texto da mensagem a ser analisado
   * @param programs Lista de programas de milhas disponíveis (com ID e nome)
   */
  abstract parse(text: string, programs?: ProgramOption[]): Promise<PurchaseRequest | null>;
}

