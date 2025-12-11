import { Injectable } from '@nestjs/common';
import type { PurchaseRequest } from '../types/purchase.types';

/**
 * Classe abstrata para parsing de mensagens (ISP - Interface Segregation Principle)
 * Apenas expõe o que é necessário
 * Pode ser usada como provider token no NestJS
 */
@Injectable()
export abstract class MessageParser {
  abstract parse(text: string): Promise<PurchaseRequest | null>;
}

