import { Injectable } from '@nestjs/common';
import { MessageParser } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PurchaseValidatorService } from '../../../domain/services/purchase-validator.service';
import type { Provider } from '../../../domain/types/provider.types';
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
    private readonly messageSender: TelegramMessageSender,
  ) {}

  async handlePurchase(chatId: number, messageId: number | undefined, text: string): Promise<void> {
    // Busca providers disponíveis primeiro para passar ao parser
    const priceTableResult = await this.priceTableProvider.getPriceTable();
    const { priceTables, customMaxPrice } = priceTableResult;
    const providers = Object.keys(priceTables) as Provider[];

    // Passa os providers como contexto para ajudar o modelo a reconhecer melhor
    const purchaseRequest = await this.messageParser.parse(text, providers);

    console.log('Purchase request', purchaseRequest);

    const validatedRequest = this.purchaseValidator.validate(purchaseRequest);

    console.log('Validated request', validatedRequest);

    if (!validatedRequest) {
      return;
    }

    const availableProviders = Object.keys(priceTables).filter(
      (provider) => priceTables[provider] && Object.keys(priceTables[provider]).length > 0,
    ) as Provider[];

    // Encontra o provider correspondente ao programa mencionado usando comparação case-insensitive
    let selectedProvider: Provider | null = null;

    if (validatedRequest.airline) {
      console.log('Finding provider for airline', validatedRequest.airline);
      selectedProvider = this.findProviderByName(validatedRequest.airline, availableProviders);
    }

    console.log('Selected provider', selectedProvider);

    if (!selectedProvider) {
      console.warn('No provider found for the requested airline');
      return;
    }

    const priceTable = priceTables[selectedProvider];

    if (!priceTable || Object.keys(priceTable).length === 0) {
      console.warn('No price table found for the selected provider');
      return;
    }

    const providerCustomMaxPrice = customMaxPrice[selectedProvider];
    const options = providerCustomMaxPrice !== undefined ? { customMaxPrice: providerCustomMaxPrice } : undefined;

    console.log(
      'Calculating price',
      validatedRequest.quantity,
      validatedRequest.cpfCount,
      priceTable,
      options,
    );
    const priceResult = this.priceCalculator.calculate(
      validatedRequest.quantity,
      validatedRequest.cpfCount,
      priceTable,
      options,
    );

    if (!priceResult.success) {
      return;
    }

    // Verifica se o usuário forneceu valores aceitos e se o menor valor aceito é maior que o preço calculado
    if (validatedRequest.acceptedPrices.length > 0 && priceResult.success) {
      const minAcceptedPrice = Math.min(...validatedRequest.acceptedPrices);
      if (minAcceptedPrice > priceResult.price) {
        // O usuário aceita pagar mais que nosso preço - responder com mensagem customizada
        await this.messageSender.sendMessage(chatId, 'Vamos!', messageId);
        return;
      }
    }

    await this.messageSender.sendMessage(
      chatId,
      Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(priceResult.price),
      messageId,
    );
  }

  /**
   * Encontra o provider correspondente ao programa mencionado usando comparação case-insensitive
   * Retorna o provider exato da lista de providers disponíveis
   */
  private findProviderByName(
    mentionedProvider: string | null | undefined,
    availableProviders: Provider[],
  ): Provider | null {
    if (!mentionedProvider) {
      return null;
    }

    const normalizedMentioned = mentionedProvider.trim().toUpperCase();

    // Primeiro tenta correspondência exata (case-insensitive)
    for (const provider of availableProviders) {
      if (provider.trim().toUpperCase() === normalizedMentioned) {
        return provider;
      }
    }

    // Depois tenta correspondência parcial (case-insensitive)
    for (const provider of availableProviders) {
      const normalizedProvider = provider.trim().toUpperCase();

      // Verifica se um contém o outro
      if (
        normalizedProvider.includes(normalizedMentioned) ||
        normalizedMentioned.includes(normalizedProvider)
      ) {
        return provider;
      }
    }

    return null;
  }
}
