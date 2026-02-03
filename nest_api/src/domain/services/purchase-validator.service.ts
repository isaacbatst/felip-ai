import { Injectable } from '@nestjs/common';
import type { PurchaseProposal, ValidatedPurchaseRequest } from '../types/purchase.types';

/**
 * Service responsável por validar propostas de compra
 * Single Responsibility: apenas validação de purchase requests
 */
@Injectable()
export class PurchaseValidatorService {
  /**
   * Converte uma PurchaseProposal em ValidatedPurchaseRequest
   * Com a discriminated union, os campos obrigatórios já são garantidos pelo schema
   */
  validate(request: PurchaseProposal | null): ValidatedPurchaseRequest | null {
    if (!request) {
      console.warn('No purchase request received');
      return null;
    }

    // Com a discriminated union, quantity, cpfCount e airlineId são garantidamente números
    return {
      quantity: request.quantity,
      cpfCount: request.cpfCount,
      airlineId: request.airlineId,
      acceptedPrices: request.acceptedPrices ?? [],
    };
  }
}

