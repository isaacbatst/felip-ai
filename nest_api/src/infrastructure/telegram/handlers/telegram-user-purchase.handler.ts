import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { Injectable, Logger } from '@nestjs/common';
import { buildCallToActionMessage, buildCounterOfferMessage } from '../../../domain/constants/counter-offer-templates';
import { MessageParser, type ProgramOption } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PrivateMessageBufferService } from '../private-message-buffer.service';

interface CalculatedPriceResult {
  price: number;
  isLiminar: boolean;
  programName: string;
}

interface EffectiveProgram {
  programId: number;
  isLiminar: boolean;
}

/**
 * Handler responsável por processar requisições de compra de milhas
 * Single Responsibility: apenas processamento de compras
 * Composition: usa vários services para processar a compra
 */
@Injectable()
export class TelegramPurchaseHandler {
  private readonly logger = new Logger(TelegramPurchaseHandler.name);

  constructor(
    private readonly messageParser: MessageParser,
    private readonly priceTableProvider: PriceTableProvider,
    private readonly priceCalculator: PriceCalculatorService,
    private readonly tdlibUserClient: TelegramUserClientProxyService,
    private readonly counterOfferSettingsRepository: CounterOfferSettingsRepository,
    private readonly milesProgramRepository: MilesProgramRepository,
    private readonly privateMessageBuffer: PrivateMessageBufferService,
  ) {}

  async handlePurchase(
    loggedInUserId: string,
    telegramUserId: string,
    chatId: number,
    messageId: number | undefined,
    text: string,
    senderId?: number,
  ): Promise<void> {
    const trimmedText = text.trim();

    // Validação 1: mensagem muito curta
    if (trimmedText.length < 10) {
      this.logger.log('Skipping: message too short', {
        length: trimmedText.length,
        text: trimmedText,
      });
      return;
    }

    // Validação 2: mensagem é só números (com vírgulas/pontos decimais)
    const onlyNumbersPattern = /^[\d.,\s]+$/;
    if (onlyNumbersPattern.test(trimmedText)) {
      this.logger.log('Skipping: message contains only numbers', { text: trimmedText });
      return;
    }

    // Validação 3: mensagem não contém números
    const hasNumbersPattern = /\d/;
    if (!hasNumbersPattern.test(trimmedText)) {
      this.logger.log('Skipping: message has no numbers', { text: trimmedText });
      return;
    }

    // Busca todos os programas do banco para passar ao parser (melhora reconhecimento)
    const allPrograms = await this.milesProgramRepository.getAllPrograms();
    const programsForParser: ProgramOption[] = allPrograms.map((p) => ({ id: p.id, name: p.name }));

    // Passa os programas como contexto para ajudar o modelo a reconhecer melhor
    const purchaseRequests = await this.messageParser.parse(text, programsForParser);

    // Ignorar se não houver propostas ou se houver mais de uma
    if (!purchaseRequests || purchaseRequests.length !== 1) {
      if (purchaseRequests && purchaseRequests.length > 1) {
        this.logger.warn('Multiple proposals found, ignoring', { count: purchaseRequests.length });
      } else {
        this.logger.warn('No validated request');
      }
      return;
    }

    const purchaseRequest = purchaseRequests[0];

    if (purchaseRequest.airlineId === undefined) {
      this.logger.warn('No airlineId in purchase request');
      return;
    }

    // Get the program from the ID returned by the parser
    const program = allPrograms.find((p) => p.id === purchaseRequest.airlineId);
    if (!program) {
      this.logger.warn('Program not found for airlineId', { airlineId: purchaseRequest.airlineId });
      return;
    }

    this.logger.debug('Selected program', { id: program.id, name: program.name });

    const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(loggedInUserId);

    // Determine effective programs (normal and/or liminar) based on miles availability and min quantity
    const effectivePrograms = await this.getEffectivePrograms(
      loggedInUserId,
      program.id,
      program.name,
      purchaseRequest.quantity,
      purchaseRequest.cpfCount,
      configuredProgramIds,
    );

    if (effectivePrograms.length === 0) {
      this.logger.warn('No effective programs found (no program has enough miles or meets min quantity)');
      return;
    }

    // Calculate prices for each effective program
    const calculatedPrices: CalculatedPriceResult[] = [];
    for (const ep of effectivePrograms) {
      const epProgram = ep.programId === program.id
        ? program
        : await this.milesProgramRepository.getProgramById(ep.programId);
      if (!epProgram) continue;

      const priceTable = await this.priceTableProvider.getPriceTableForProgram(loggedInUserId, ep.programId);
      if (!priceTable || Object.keys(priceTable).length === 0) continue;

      const maxPrice = await this.priceTableProvider.getMaxPriceForProgram(loggedInUserId, ep.programId);
      const options = maxPrice !== null && maxPrice > 0 ? { customMaxPrice: maxPrice } : undefined;

      const priceResult = this.priceCalculator.calculate(
        purchaseRequest.quantity / 1000,
        purchaseRequest.cpfCount,
        priceTable,
        options,
      );

      if (priceResult.success) {
        calculatedPrices.push({
          price: priceResult.price,
          isLiminar: ep.isLiminar,
          programName: epProgram.name,
        });
      }
    }

    if (calculatedPrices.length === 0) {
      this.logger.warn('No successful price calculations');
      return;
    }

    this.logger.log('Message to reply:', messageId);

    const lowestPrice = Math.min(...calculatedPrices.map((p) => p.price));
    const programaForMessage = calculatedPrices.length === 1
      ? calculatedPrices[0].programName
      : program.name;

    // Caso 1: Sem accepted prices -> mensagem padrão
    if (purchaseRequest.acceptedPrices.length === 0) {
      await this.sendGroupAnswer(telegramUserId, chatId, calculatedPrices, messageId);
      return;
    }

    const maxAcceptedPrice = Math.max(...purchaseRequest.acceptedPrices);

    // Caso 2: Preço aceito >= calculado (lowest) -> "Vamos!" + call to action no privado
    console.log('maxAcceptedPrice', maxAcceptedPrice, 'lowestPrice', lowestPrice);
    if (maxAcceptedPrice >= lowestPrice) {
      this.logger.log('User max accepted price is higher than calculated price', {
        maxAcceptedPrice,
        lowestPrice,
      });
      await this.tdlibUserClient.sendMessage(telegramUserId, chatId, 'Vamos!', messageId);

      if (!senderId) {
        this.logger.warn('No senderId, ignoring call to action');
        return;
      }
      const counterOfferSettings = await this.counterOfferSettingsRepository.getSettings(loggedInUserId);
      if(!counterOfferSettings?.isEnabled) {
        this.logger.warn('Counter offer is disabled, ignoring call to action');
        return;
      }

      // Envia template de call to action no privado do usuário
      const templateId = counterOfferSettings?.callToActionTemplateId ?? 1;

      // Apply accepted price as floor to each calculated price
      const pricesForCTA = calculatedPrices.map((p) => ({
        ...p,
        price: Math.max(p.price, maxAcceptedPrice),
      }));

      const message = buildCallToActionMessage(
        templateId,
        programaForMessage,
        purchaseRequest.quantity,
        purchaseRequest.cpfCount,
        this.formatPrivatePrice(pricesForCTA),
      );

      if (counterOfferSettings.dedupEnabled) {
        const key = `${loggedInUserId}:${senderId}:cta`;
        const ttlMs = counterOfferSettings.dedupWindowMinutes * 60 * 1000;
        if (this.privateMessageBuffer.shouldSkip(key, ttlMs)) {
          return;
        }
      }

      this.logger.log('Sending call to action to buyer in private', {
        senderId,
        templateId,
        lowestPrice,
      });

      await this.tdlibUserClient.sendMessageToUser(telegramUserId, senderId, message);

      return;
    }

    const counterOfferSettings = await this.counterOfferSettingsRepository.getSettings(loggedInUserId);

    // Counter offer desabilitado -> envia resposta no grupo mas não envia contra-oferta privada
    if (!counterOfferSettings?.isEnabled) {
      await this.sendGroupAnswer(telegramUserId, chatId, calculatedPrices, messageId);
      return;
    }

    const priceDiff = lowestPrice - maxAcceptedPrice;
    // Diferença acima do threshold -> envia mensagem padrão no grupo mesmo assim
    if (priceDiff > counterOfferSettings.priceThreshold) {
      this.logger.log('Price difference is greater than threshold, sending default message only', {
        priceDiff,
        priceThreshold: counterOfferSettings.priceThreshold,
        lowestPrice,
        maxAcceptedPrice,
      });
      // Envia mensagem padrão no grupo mesmo quando fora do range aceitável
      await this.sendGroupAnswer(telegramUserId, chatId, calculatedPrices, messageId);
      return;
    }

    if (!senderId) {
      this.logger.warn('No senderId, ignoring counter offer');
      return;
    }

    // Envia nossa oferta no grupo
    await this.sendGroupAnswer(telegramUserId, chatId, calculatedPrices, messageId);

    // Envia counter offer no privado
    const message = buildCounterOfferMessage(
      counterOfferSettings.messageTemplateId,
      programaForMessage,
      purchaseRequest.quantity,
      purchaseRequest.cpfCount,
      this.formatPrivatePrice(calculatedPrices),
    );

    if (counterOfferSettings.dedupEnabled) {
      const key = `${loggedInUserId}:${senderId}:counterOffer`;
      const ttlMs = counterOfferSettings.dedupWindowMinutes * 60 * 1000;
      if (this.privateMessageBuffer.shouldSkip(key, ttlMs)) {
        return;
      }
    }

    this.logger.log('Sending counter offer to buyer', {
      senderId,
      priceDiff,
      threshold: counterOfferSettings.priceThreshold,
      templateId: counterOfferSettings.messageTemplateId,
    });

    await this.tdlibUserClient.sendMessageToUser(telegramUserId, senderId, message);
  }

  /**
   * Determines the effective programs (normal and/or liminar) that can serve this request.
   * When a normal program is requested, returns both normal and liminar if both pass checks.
   * When a liminar program is requested directly, returns only the liminar.
   */
  private async getEffectivePrograms(
    userId: string,
    programId: number,
    programName: string,
    quantity: number,
    cpfCount: number,
    configuredProgramIds: number[],
  ): Promise<EffectiveProgram[]> {
    const isLiminar = programName.toLowerCase().includes('liminar');

    // If it's already a liminar program, just validate it (no reverse lookup to normal)
    if (isLiminar) {
      if (await this.passesProgramChecks(userId, programId, quantity, cpfCount)) {
        return [{ programId, isLiminar: true }];
      }
      this.logger.warn('Liminar program does not pass checks', { programId, quantity });
      return [];
    }

    // Normal program requested: check both normal and its liminar variant
    const results: EffectiveProgram[] = [];

    // Check normal program (only if configured)
    if (configuredProgramIds.includes(programId) && await this.passesProgramChecks(userId, programId, quantity, cpfCount)) {
      results.push({ programId, isLiminar: false });
    }

    // Check liminar program
    const liminarProgram = await this.milesProgramRepository.findLiminarFor(programId);
    if (liminarProgram && configuredProgramIds.includes(liminarProgram.id)) {
      if (await this.passesProgramChecks(userId, liminarProgram.id, quantity, cpfCount)) {
        results.push({ programId: liminarProgram.id, isLiminar: true });
      }
    }

    return results;
  }

  /**
   * Checks if a program passes min quantity and sufficient miles checks.
   */
  private async passesProgramChecks(
    userId: string,
    programId: number,
    quantity: number,
    cpfCount: number,
  ): Promise<boolean> {
    const minQuantity = await this.priceTableProvider.getMinQuantityForProgram(userId, programId);
    const quantityPerCpf = quantity / cpfCount;
    if (minQuantity && minQuantity > 0 && quantityPerCpf < minQuantity) {
      this.logger.debug('Program does not meet min quantity', { programId, quantityPerCpf, minQuantity });
      return false;
    }

    const hasMiles = await this.priceTableProvider.hasSufficientMiles(userId, programId, quantity);
    if (!hasMiles) {
      this.logger.debug('Program has insufficient miles', { programId, quantity });
      return false;
    }

    return true;
  }

  /**
   * Envia a mensagem padrão com o(s) preço(s) calculado(s).
   */
  private async sendGroupAnswer(
    telegramUserId: string,
    chatId: number,
    prices: CalculatedPriceResult[],
    messageId: number | undefined,
  ): Promise<void> {
    const hasBoth = prices.length > 1;
    const lines = prices.map((p) => {
      const priceMessage = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(p.price);
      if (hasBoth) {
        return p.isLiminar ? `${priceMessage} Liminar` : `${priceMessage} Normal`;
      }
      return p.isLiminar ? `${priceMessage} Liminar` : priceMessage;
    });
    const finalMessage = lines.join('\n');
    await this.tdlibUserClient.sendMessage(telegramUserId, chatId, finalMessage, messageId);
  }

  /**
   * Formats prices for private messages (CTA/counter-offer).
   * Single normal price: "20,00"
   * Single liminar price: "21,00 (Liminar)"
   * Dual prices: "20,00 (Normal) / 21,00 (Liminar)"
   */
  private formatPrivatePrice(prices: CalculatedPriceResult[]): string {
    const format = (value: number) => Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

    if (prices.length === 1) {
      const p = prices[0];
      return p.isLiminar ? `${format(p.price)} (Liminar)` : format(p.price);
    }

    return prices.map((p) => {
      const label = p.isLiminar ? 'Liminar' : 'Normal';
      return `${format(p.price)} (${label})`;
    }).join(' / ');
  }
}
