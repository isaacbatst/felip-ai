import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { Injectable, Logger } from '@nestjs/common';
import { MessageParser, type ProgramOption } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PurchaseValidatorService } from '../../../domain/services/purchase-validator.service';
import { buildCounterOfferMessage, buildCallToActionMessage } from '../../../domain/constants/counter-offer-templates';

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
    private readonly purchaseValidator: PurchaseValidatorService,
    private readonly priceCalculator: PriceCalculatorService,
    private readonly tdlibUserClient: TelegramUserClientProxyService,
    private readonly counterOfferSettingsRepository: CounterOfferSettingsRepository,
    private readonly milesProgramRepository: MilesProgramRepository,
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

    // Check if user has configured this program
    const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(loggedInUserId);
    if (!configuredProgramIds.includes(program.id)) {
      this.logger.warn('Program not configured for user', {
        programId: program.id,
        programName: program.name,
        configuredProgramIds,
      });
      return;
    }

    // Determine the effective program ID (normal or liminar) based on miles availability
    const effectiveProgramId = await this.getEffectiveProgramId(
      loggedInUserId,
      program.id,
      purchaseRequest.quantity,
    );

    if (effectiveProgramId === null) {
      this.logger.warn('No effective program found (neither normal nor liminar has enough miles)');
      return;
    }

    // Get the effective program data for display purposes
    const effectiveProgram = effectiveProgramId === program.id
      ? program
      : await this.milesProgramRepository.getProgramById(effectiveProgramId);

    if (!effectiveProgram) {
      this.logger.warn('Effective program not found', { effectiveProgramId });
      return;
    }

    const priceTable = await this.priceTableProvider.getPriceTableForProgram(loggedInUserId, effectiveProgramId);

    if (!priceTable || Object.keys(priceTable).length === 0) {
      this.logger.warn('No price table found for the effective program', { effectiveProgramId });
      return;
    }

    const maxPrice = await this.priceTableProvider.getMaxPriceForProgram(loggedInUserId, effectiveProgramId);
    const options = maxPrice !== null ? { customMaxPrice: maxPrice } : undefined;

    const priceResult = this.priceCalculator.calculate(
      purchaseRequest.quantity / 1000, // Convert from units to thousands (price table keys are in thousands)
      purchaseRequest.cpfCount,
      priceTable,
      options,
    );

    if (!priceResult.success) {
      return;
    }

    this.logger.log('Message to reply:', messageId);

    const isLiminar = effectiveProgram.name.toLowerCase().includes('liminar');

    // Caso 1: Sem accepted prices -> mensagem padrão
    if (purchaseRequest.acceptedPrices.length === 0) {
      await this.sendGroupAnswer(
        telegramUserId,
        chatId,
        priceResult.price,
        isLiminar,
        messageId,
      );
      return;
    }

    const maxAcceptedPrice = Math.max(...purchaseRequest.acceptedPrices);

    // Caso 2: Preço aceito >= calculado -> "Vamos!" + call to action no privado
    if (maxAcceptedPrice >= priceResult.price) {
      this.logger.log('User max accepted price is higher than calculated price', {
        maxAcceptedPrice,
        priceResultPrice: priceResult.price,
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

      const message = buildCallToActionMessage(
        templateId,
        effectiveProgram.name,
        purchaseRequest.quantity,
        purchaseRequest.cpfCount,
        maxAcceptedPrice, // preço máximo aceito pelo usuário
      );

      this.logger.log('Sending call to action to buyer in private', {
        senderId,
        templateId,
        offeredPrice: priceResult.price,
      });

      await this.tdlibUserClient.sendMessage(telegramUserId, senderId, message);

      return;
    }

    const counterOfferSettings = await this.counterOfferSettingsRepository.getSettings(loggedInUserId);

    // Counter offer desabilitado -> ignorar
    if (!counterOfferSettings?.isEnabled) {
      return;
    }

    const priceDiff = priceResult.price - maxAcceptedPrice;
    // Diferença acima do threshold -> envia mensagem padrão no grupo mesmo assim
    if (priceDiff > counterOfferSettings.priceThreshold) {
      this.logger.log('Price difference is greater than threshold, sending default message only', {
        priceDiff,
        priceThreshold: counterOfferSettings.priceThreshold,
        priceResultPrice: priceResult.price,
        maxAcceptedPrice,
      });
      // Envia mensagem padrão no grupo mesmo quando fora do range aceitável
      await this.sendGroupAnswer(telegramUserId, chatId, priceResult.price, isLiminar, messageId);
      return;
    }

    if (!senderId) {
      this.logger.warn('No senderId, ignoring counter offer');
      return;
    }

    // Envia nossa oferta no grupo
    await this.sendGroupAnswer(telegramUserId, chatId, priceResult.price, isLiminar, messageId);

    // Envia counter offer no privado
    const message = buildCounterOfferMessage(
      counterOfferSettings.messageTemplateId,
      effectiveProgram.name,
      purchaseRequest.quantity,
      purchaseRequest.cpfCount,
      priceResult.price,
    );

    this.logger.log('Sending counter offer to buyer', {
      senderId,
      priceDiff,
      threshold: counterOfferSettings.priceThreshold,
      templateId: counterOfferSettings.messageTemplateId,
    });

    await this.tdlibUserClient.sendMessage(telegramUserId, senderId, message);
  }

  /**
   * Determines the effective program ID (normal or liminar) based on miles availability.
   * If the normal program doesn't have enough miles, tries to use the liminar program.
   * Returns the effective program ID if available, null otherwise.
   */
  private async getEffectiveProgramId(
    userId: string,
    programId: number,
    quantity: number,
  ): Promise<number | null> {
    // Get the program to check if it's already a liminar
    const program = await this.milesProgramRepository.getProgramById(programId);
    if (!program) {
      return null;
    }

    const isLiminar = program.name.toLowerCase().includes('liminar');

    // If it's already a liminar program, just validate it
    if (isLiminar) {
      const hasMiles = await this.priceTableProvider.hasSufficientMiles(userId, programId, quantity);
      if (hasMiles) {
        return programId;
      }
      this.logger.warn('Not enough miles for liminar program', { programId, quantity });
      return null;
    }

    // Try normal program first
    const hasNormalMiles = await this.priceTableProvider.hasSufficientMiles(userId, programId, quantity);
    if (hasNormalMiles) {
      return programId;
    }

    this.logger.debug('Normal program has insufficient miles, looking for liminar', { programId, quantity });

    // If normal doesn't have enough miles, try liminar
    const liminarProgram = await this.milesProgramRepository.findLiminarFor(programId);
    if (!liminarProgram) {
      this.logger.debug('No liminar program found for', { programId });
      return null;
    }

    // Check if user has configured the liminar program
    const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(userId);
    if (!configuredProgramIds.includes(liminarProgram.id)) {
      this.logger.debug('Liminar program not configured for user', { liminarProgramId: liminarProgram.id });
      return null;
    }

    // Validate liminar program has enough miles
    const hasLiminarMiles = await this.priceTableProvider.hasSufficientMiles(userId, liminarProgram.id, quantity);
    if (hasLiminarMiles) {
      this.logger.debug('Using liminar program instead of normal', {
        normalProgramId: programId,
        liminarProgramId: liminarProgram.id,
        liminarName: liminarProgram.name,
      });
      return liminarProgram.id;
    }

    this.logger.warn('Neither normal nor liminar program has enough miles', {
      normalProgramId: programId,
      liminarProgramId: liminarProgram.id,
      quantity,
    });
    return null;
  }

  /**
   * Envia a mensagem padrão com o preço calculado.
   */
  private async sendGroupAnswer(
    telegramUserId: string,
    chatId: number,
    price: number,
    isLiminar: boolean,
    messageId: number | undefined,
  ): Promise<void> {
    const priceMessage = Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(price);
    const finalMessage = isLiminar ? `${priceMessage} LIMINAR` : priceMessage;
    await this.tdlibUserClient.sendMessage(telegramUserId, chatId, finalMessage, messageId);
  }
}
