import { Module } from '@nestjs/common';
import { PriceCalculatorService } from './services/price-calculator.service';
import { PurchaseValidatorService } from './services/purchase-validator.service';
import { QuoteFormatterService } from './services/quote-formatter.service';

/**
 * Module responsável por serviços de domínio
 * Agrupa serviços relacionados à lógica de negócio
 */
@Module({
  providers: [
    PurchaseValidatorService,
    PriceCalculatorService,
    QuoteFormatterService,
  ],
  exports: [
    PurchaseValidatorService,
    PriceCalculatorService,
    QuoteFormatterService,
  ],
})
export class DomainModule {}

