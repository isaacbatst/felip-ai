import { Injectable } from '@nestjs/common';
import type { PurchaseRequest, ValidatedPurchaseRequest } from '../types/purchase.types';

/**
 * Service responsável por validar propostas de compra
 * Single Responsibility: apenas validação de purchase requests
 */
@Injectable()
export class PurchaseValidatorService {
  /**
   * Valida se uma PurchaseRequest tem os dados necessários para calcular preço
   */
  validate(request: PurchaseRequest | null): ValidatedPurchaseRequest | null {
    if (!request) {
      console.warn('No purchase request received');
      return null;
    }

    if (
      request.quantity === undefined ||
      request.cpfCount === undefined ||
      request.cpfCount === null ||
      request.quantity === null ||
      request.quantity <= 0 ||
      request.cpfCount <= 0
    ) {
      console.warn('Invalid purchase request', request);
      return null;
    }

    return {
      quantity: request.quantity,
      cpfCount: request.cpfCount,
      airlineId: request.airlineId ?? undefined,
      acceptedPrices: request.acceptedPrices ?? [],
    };
  }
}

