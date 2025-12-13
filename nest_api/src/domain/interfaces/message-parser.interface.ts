import { Injectable } from '@nestjs/common';
import type { Provider } from '../types/provider.types';
import type { PurchaseRequest } from '../types/purchase.types';

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
   * @param availableProviders Lista de providers disponíveis para validar se a compra é para algum deles
   */
  abstract parse(text: string, availableProviders?: Provider[]): Promise<PurchaseRequest | null>;
}

