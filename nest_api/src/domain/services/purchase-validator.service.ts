import { Injectable } from '@nestjs/common';
import type { PurchaseRequest, ValidatedPurchaseRequest } from '../types/purchase.types';
import { MilesProgramNormalizerService } from './miles-program-normalizer.service';

/**
 * Service responsável por validar propostas de compra
 * Single Responsibility: apenas validação de purchase requests
 */
@Injectable()
export class PurchaseValidatorService {
  constructor(private readonly milesProgramNormalizer: MilesProgramNormalizerService) {}

  /**
   * Valida se uma PurchaseRequest tem os dados necessários para calcular preço
   */
  validate(request: PurchaseRequest | null): ValidatedPurchaseRequest | null {
    if (!request) {
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
      return null;
    }

    const milesProgram = this.milesProgramNormalizer.normalize(request.airline ?? null);

    return {
      quantity: request.quantity,
      cpfCount: request.cpfCount,
      airline: request.airline ?? undefined,
      milesProgram,
    };
  }
}
