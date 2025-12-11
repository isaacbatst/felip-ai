import { Module } from '@nestjs/common';
import { MilesProgramNormalizerService } from './services/miles-program-normalizer.service';
import { PriceCalculatorService } from './services/price-calculator.service';
import { PurchaseValidatorService } from './services/purchase-validator.service';
import { QuoteFormatterService } from './services/quote-formatter.service';

/**
 * Module responsável por serviços de domínio
 * Agrupa serviços relacionados à lógica de negócio
 */
@Module({
  providers: [
    MilesProgramNormalizerService,
    PurchaseValidatorService,
    PriceCalculatorService,
    QuoteFormatterService,
  ],
  exports: [
    MilesProgramNormalizerService,
    PurchaseValidatorService,
    PriceCalculatorService,
    QuoteFormatterService,
  ],
})
export class DomainModule {}

