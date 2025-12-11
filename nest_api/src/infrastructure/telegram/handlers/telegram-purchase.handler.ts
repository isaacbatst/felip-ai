import { Injectable } from '@nestjs/common';
import { MessageParser } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PurchaseValidatorService } from '../../../domain/services/purchase-validator.service';
import { QuoteFormatterService } from '../../../domain/services/quote-formatter.service';
import type { MilesProgram } from '../../../domain/types/miles-program.types';
import { TelegramMessageSender } from '../interfaces/telegram-message-sender.interface';

/**
 * Handler responsável por processar requisições de compra de milhas
 * Single Responsibility: apenas processamento de compras
 * Composition: usa vários services para processar a compra
 */
@Injectable()
export class TelegramPurchaseHandler {
  constructor(
    private readonly messageParser: MessageParser,
    private readonly priceTableProvider: PriceTableProvider,
    private readonly purchaseValidator: PurchaseValidatorService,
    private readonly priceCalculator: PriceCalculatorService,
    private readonly quoteFormatter: QuoteFormatterService,
    private readonly messageSender: TelegramMessageSender,
  ) {}

  async handlePurchase(chatId: number, messageId: number | undefined, text: string): Promise<void> {
    const purchaseRequest = await this.messageParser.parse(text);

    const validatedRequest = this.purchaseValidator.validate(purchaseRequest);

    if (!validatedRequest) {
      return;
    }

    const priceTableResult = await this.priceTableProvider.getPriceTable();
    const { priceTable, availableMiles, customMaxPrice } = priceTableResult;

    const milesProgram =
      validatedRequest.milesProgram ?? this.getHighestAvailableMilesProgram(availableMiles)[0];

    const programAvailableMiles = availableMiles[milesProgram];

    if (programAvailableMiles === null || programAvailableMiles === undefined) {
      return;
    }

    if (validatedRequest.quantity > programAvailableMiles) {
      return;
    }

    const priceResult = this.priceCalculator.calculate(
      validatedRequest.quantity,
      validatedRequest.cpfCount,
      priceTable,
      customMaxPrice !== undefined ? { customMaxPrice } : undefined,
    );

    if (!priceResult.success) {
      return;
    }

    const formattedResponse = this.quoteFormatter.formatQuoteResponse(
      validatedRequest.quantity,
      validatedRequest.cpfCount,
      priceResult.price,
      milesProgram,
    );

    await this.messageSender.sendMessage(chatId, formattedResponse, messageId);
  }

  private getHighestAvailableMilesProgram(
    availableMiles: Record<MilesProgram, number | null>,
  ): [MilesProgram, number] {
    let highestAvailableMiles: [MilesProgram, number] = ['LATAM_PASS', 0];
    for (const [program, miles] of Object.entries(availableMiles)) {
      if (miles && miles > highestAvailableMiles[1]) {
        highestAvailableMiles = [program as MilesProgram, miles];
      }
    }
    return highestAvailableMiles;
  }
}

