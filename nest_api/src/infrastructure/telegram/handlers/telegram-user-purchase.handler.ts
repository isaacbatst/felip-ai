import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { MessageParser } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PurchaseValidatorService } from '../../../domain/services/purchase-validator.service';
import type { Provider } from '../../../domain/types/provider.types';

/**
 * Handler responsável por processar requisições de compra de milhas
 * Single Responsibility: apenas processamento de compras
 * Composition: usa vários services para processar a compra
 */
@Injectable()
export class TelegramPurchaseHandler {
  private readonly logger = new Logger(TelegramPurchaseHandler.name);

  // Fallback hardcoded liminar map (used when database lookup fails or MilesProgramRepository not available)
  private static readonly LEGACY_LIMINAR_MAP: Record<string, string> = {
    'SMILES': 'SMILES LIMINAR',
    'AZUL/TUDO AZUL': 'AZUL LIMINAR',
    'LATAM': 'LATAM LIMINAR',
  };

  constructor(
    private readonly messageParser: MessageParser,
    private readonly priceTableProvider: PriceTableProvider,
    private readonly purchaseValidator: PurchaseValidatorService,
    private readonly priceCalculator: PriceCalculatorService,
    private readonly tdlibUserClient: TelegramUserClientProxyService,
    @Optional() private readonly milesProgramRepository?: MilesProgramRepository,
  ) {}

  async handlePurchase(
    botUserId: string,
    chatId: number,
    messageId: number | undefined,
    text: string,
  ): Promise<void> {
    // Busca providers disponíveis primeiro para passar ao parser
    const priceTableResult = await this.priceTableProvider.getPriceTable();
    const { priceTables, customMaxPrice } = priceTableResult;
    const providers = Object.keys(priceTables) as Provider[];

    // Passa os providers como contexto para ajudar o modelo a reconhecer melhor
    const purchaseRequest = await this.messageParser.parse(text, providers);

    const validatedRequest = this.purchaseValidator.validate(purchaseRequest);

    if (!validatedRequest) {
      this.logger.warn('No validated request');
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

    // Determine the effective provider (normal or liminar) based on miles availability
    const effectiveProvider = await this.getEffectiveProvider(
      selectedProvider,
      validatedRequest.quantity,
      priceTableResult.availableMiles,
      availableProviders,
    );

    if (!effectiveProvider) {
      console.warn('No effective provider found (neither normal nor liminar has enough miles)');
      return;
    }

    console.log('Effective provider', effectiveProvider);

    const priceTable = priceTables[effectiveProvider];

    if (!priceTable || Object.keys(priceTable).length === 0) {
      console.warn('No price table found for the effective provider');
      return;
    }

    const providerCustomMaxPrice = customMaxPrice[effectiveProvider];
    const options =
      providerCustomMaxPrice !== undefined ? { customMaxPrice: providerCustomMaxPrice } : undefined;

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

    this.logger.log('Message to reply:', messageId);

    // Verifica se o usuário forneceu valores aceitos e se o menor valor aceito é maior que o preço calculado
    if (validatedRequest.acceptedPrices.length > 0 && priceResult.success) {
      const minAcceptedPrice = Math.min(...validatedRequest.acceptedPrices);
      console.log('Min accepted price:', minAcceptedPrice);
      console.log('Price result:', priceResult.price);
      if (minAcceptedPrice >= priceResult.price) {
        // O usuário aceita pagar mais que nosso preço - responder com mensagem customizada

        await this.tdlibUserClient.sendMessage(botUserId, chatId, 'Vamos!', messageId);
        return;
      }
    }

    const priceMessage = Intl.NumberFormat('pt-BR', {  maximumFractionDigits: 2 }).format(priceResult.price);
    const isLiminar = effectiveProvider.toLowerCase().includes('liminar');
    const finalMessage = isLiminar ? `${priceMessage} LIMINAR` : priceMessage;

    await this.tdlibUserClient.sendMessage(
      botUserId,
      chatId,
      finalMessage,
      messageId,
    );
  }

  /**
   * Determines the effective provider (normal or liminar) based on miles availability.
   * If the normal program doesn't have enough miles, tries to use the liminar program.
   * Returns the effective provider if available, null otherwise.
   * 
   * Liminar lookup priority:
   * 1. Database lookup via MilesProgramRepository (if available)
   * 2. Fallback to hardcoded LEGACY_LIMINAR_MAP
   */
  private async getEffectiveProvider(
    selectedProvider: Provider,
    quantity: number,
    availableMiles: Record<string, number | null>,
    availableProviders: Provider[],
  ): Promise<Provider | null> {
    const requiredMiles = quantity * 1000;
    const isLiminar = selectedProvider.toLowerCase().includes('liminar');

    // If it's already a liminar program, just validate it
    if (isLiminar) {
      if (this.validateMilesAvailability(selectedProvider, requiredMiles, availableMiles)) {
        return selectedProvider;
      }
      return null;
    }

    // Try normal program first
    if (this.validateMilesAvailability(selectedProvider, requiredMiles, availableMiles)) {
      return selectedProvider;
    }

    // If normal doesn't have enough miles, try liminar
    const liminarProgramName = await this.findLiminarProgramName(selectedProvider);
    if (!liminarProgramName) {
      return null;
    }

    // Check if liminar program exists in available providers
    const liminarProvider = availableProviders.find(
      (p) => p.toUpperCase() === liminarProgramName.toUpperCase(),
    ) as Provider | undefined;

    if (!liminarProvider) {
      return null;
    }

    // Validate liminar program
    if (this.validateMilesAvailability(liminarProvider, requiredMiles, availableMiles)) {
      this.logger.debug('Using liminar program instead of normal', {
        normal: selectedProvider,
        liminar: liminarProvider,
      });
      return liminarProvider;
    }

    return null;
  }

  /**
   * Find the liminar program name for a given normal program.
   * First tries database lookup, then falls back to hardcoded map.
   */
  private async findLiminarProgramName(normalProviderName: string): Promise<string | null> {
    // Try database lookup first if repository is available
    if (this.milesProgramRepository) {
      try {
        const normalProgram = await this.milesProgramRepository.getProgramByName(normalProviderName);
        if (normalProgram) {
          const liminarProgram = await this.milesProgramRepository.findLiminarFor(normalProgram.id);
          if (liminarProgram) {
            this.logger.debug('Found liminar program from database', {
              normal: normalProviderName,
              liminar: liminarProgram.name,
            });
            return liminarProgram.name;
          }
        }
      } catch (error) {
        this.logger.warn('Error looking up liminar program from database, falling back to hardcoded map', { error });
      }
    }

    // Fallback to hardcoded map
    const liminarName = TelegramPurchaseHandler.LEGACY_LIMINAR_MAP[normalProviderName];
    if (liminarName) {
      this.logger.debug('Using hardcoded liminar map', {
        normal: normalProviderName,
        liminar: liminarName,
      });
    }
    return liminarName ?? null;
  }

  /**
   * Validates if a provider has enough miles available for the requested quantity.
   */
  private validateMilesAvailability(
    provider: Provider,
    requiredMiles: number,
    availableMiles: Record<string, number | null>,
  ): boolean {
    const availableMilesForProvider = availableMiles[provider];
    const hasEnoughMiles =
      availableMilesForProvider !== null && availableMilesForProvider >= requiredMiles;

    this.logger.debug('Miles availability', {
      provider,
      requiredMiles,
      availableMilesForProvider,
      hasEnoughMiles,
    });

    if (!availableMilesForProvider) {
      console.warn('No miles available for the provider', provider);
      return false;
    }

    if (!hasEnoughMiles) {
      console.warn('Not enough miles available for the provider', provider);
      return false;
    }

    return true;
  }

  /**
   * Encontra o provider correspondente ao programa mencionado usando comparação case-insensitive
   * Retorna o provider exato da lista de providers disponíveis
   */
  private findProviderByName(
    mentionedProvider: string | null | undefined,
    availableProviders: Provider[],
  ): Provider | null {
    console.log('Finding provider by name', mentionedProvider, availableProviders);
    return TelegramPurchaseHandler.findProviderByName(mentionedProvider, availableProviders);
  }

  static findProviderByName(
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
      if (normalizedProvider === normalizedMentioned) {
        return provider;
      }
    }

    return null;
  }
}
