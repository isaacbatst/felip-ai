import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { BotPreferenceRepository } from '@/infrastructure/persistence/bot-status.repository';
import { GroupDelaySettingsRepository } from '@/infrastructure/persistence/group-delay-settings.repository';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { Injectable, Logger } from '@nestjs/common';
import { buildCallToActionMessage, buildCounterOfferMessage } from '../../../domain/constants/counter-offer-templates';
import { MessageParser, type ProgramOption } from '../../../domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '../../../domain/interfaces/price-table-provider.interface';
import { PriceCalculatorService } from '../../../domain/services/price-calculator.service';
import { PrivateMessageBufferService } from '../private-message-buffer.service';
import { BlacklistRepository } from '@/infrastructure/persistence/blacklist.repository';
import { GroupReasoningSettingsRepository } from '@/infrastructure/persistence/group-reasoning-settings.repository';
import { AppConfigService } from '@/config/app.config';

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
    private readonly botPreferenceRepository: BotPreferenceRepository,
    private readonly groupDelaySettingsRepository: GroupDelaySettingsRepository,
    private readonly blacklistRepository: BlacklistRepository,
    private readonly groupReasoningSettingsRepository: GroupReasoningSettingsRepository,
    private readonly appConfig: AppConfigService,
  ) {}

  async handlePurchase(
    loggedInUserId: string,
    telegramUserId: string,
    chatId: number,
    messageId: number | undefined,
    text: string,
    senderId?: number,
    isReply?: boolean,
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

    // Validação 2: mensagem muito longa (propostas reais são telegráficas, ~18-46 chars)
    if (trimmedText.length > 150) {
      this.logger.log('Skipping: message too long for a real purchase proposal', {
        length: trimmedText.length,
        text: trimmedText.substring(0, 80) + '...',
      });
      return;
    }

    // Validação 3: mensagem é só números (com vírgulas/pontos decimais)
    const onlyNumbersPattern = /^[\d.,\s]+$/;
    if (onlyNumbersPattern.test(trimmedText)) {
      this.logger.log('Skipping: message contains only numbers', { text: trimmedText });
      return;
    }

    // Validação 4: mensagem não contém números
    const hasNumbersPattern = /\d/;
    if (!hasNumbersPattern.test(trimmedText)) {
      this.logger.log('Skipping: message has no numbers', { text: trimmedText });
      return;
    }

    // Validação 5: mensagem é uma resposta (reply) a outra mensagem
    if (isReply) {
      this.logger.log('Skipping: message is a reply to another message');
      return;
    }

    // Validação 6: mensagem contém palavras que não aparecem em demandas reais
    // Demandas reais seguem o padrão: programa + quantidade + CPF + preço aceito (opcional)
    // Palavras como "bot", "robô", "pegadinha", "teste", "armadilha" indicam armadilha ou teste
    const normalizedForTrapCheck = trimmedText.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const trapWords = [
      'bot', 'robo', 'robot', 'pegadinha', 'teste', 'armadilha',
      'transferencia', 'tenho', 'faco', 'vendo', 'teto smiles', 'smiles teto',
      'interessar', 'interesse', 'banimento', 'ia', 'brincadeira',
      'joke', 'malandragem', 'compramos', 'negociar', 'chama',
      'informacoes', 'pv', 'privado',
      'conta cheia', 'contas cheias', 'conta fechada', 'contas fechadas',
      'na conversa', 'internamente', 'estruturada em', 'estruturado em',
      'em relacao', 'voltando ao assunto', 'disse que', 'afirmou que',
      'informou que', 'se confirmar', 'se estiver',
    ];
    const trapPattern = new RegExp(trapWords.map(w => {
      // Add optional plural 's' to single-word entries (skip 2-letter words to avoid false positives)
      if (!w.includes(' ') && w.length > 2) {
        return `\\b${w}s?\\b`;
      }
      return `\\b${w}\\b`;
    }).join('|'));
    if (trapPattern.test(normalizedForTrapCheck)) {
      this.logger.log('Skipping: message contains trap word', { text: trimmedText });
      return;
    }

    // Busca todos os programas do banco para passar ao parser (melhora reconhecimento)
    const allPrograms = await this.milesProgramRepository.getAllPrograms();
    const programsForParser: ProgramOption[] = allPrograms.map((p) => ({ id: p.id, name: p.name }));

    // Lookup per-group reasoning mode
    const reasoningSetting = await this.groupReasoningSettingsRepository.getGroupReasoningSetting(
      loggedInUserId,
      chatId,
    );
    const reasoningEffort = reasoningSetting?.reasoningMode === 'precise' ? 'high' as const : 'minimal' as const;

    // Passa os programas como contexto para ajudar o modelo a reconhecer melhor
    const purchaseRequests = await this.messageParser.parse(text, programsForParser, reasoningEffort);

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

    // Validação: múltiplos preços aceitos indica tentativa de detectar bots
    if (purchaseRequest.acceptedPrices.length > 1) {
      this.logger.warn('Multiple accepted prices detected, likely bot trap — skipping', {
        acceptedPrices: purchaseRequest.acceptedPrices,
        text: trimmedText,
      });
      return;
    }

    if (purchaseRequest.airlineId === undefined) {
      this.logger.warn('No airlineId in purchase request');
      return;
    }

    // Get the program from the ID returned by the parser
    let program = allPrograms.find((p) => p.id === purchaseRequest.airlineId);
    if (!program) {
      this.logger.warn('Program not found for airlineId', { airlineId: purchaseRequest.airlineId });
      return;
    }

    this.logger.debug('Selected program', { id: program.id, name: program.name });

    // cpfCount=0 + non-Viagens Azul → redirect to Azul Viagens
    if (purchaseRequest.cpfCount === 0 && !program.noCpfAllowed) {
      const normalizedName = program.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (normalizedName.includes('azul')) {
        const azulViagensId = this.appConfig.azulViagensProgramId;
        const azulViagens = allPrograms.find((p) => p.id === azulViagensId);
        if (azulViagens?.noCpfAllowed) {
          this.logger.log('Redirecting Azul program to Azul Viagens (cpfCount=0)', {
            originalProgramId: program.id,
            originalProgramName: program.name,
            azulViagensId,
          });
          program = azulViagens;
        }
      }
    }

    // cpfCount=0: tratar como 1 para programas com noCpfAllowed, rejeitar para outros
    let effectiveCpfCount = purchaseRequest.cpfCount;
    if (purchaseRequest.cpfCount === 0) {
      if (program.noCpfAllowed) {
        effectiveCpfCount = 1;
        this.logger.log('cpfCount=0 overridden to 1 for noCpfAllowed program', { programId: program.id, programName: program.name });
      } else {
        this.logger.log('Skipping: cpfCount=0 not supported for this program', { programId: program.id });
        return;
      }
    }

    // Validação: preço aceito fora do range realista do programa (filtro de demandas absurdas)
    // acceptedPrices.length > 1 já retornou acima (multi-price bot trap), aqui só pode ser 0 ou 1
    if (purchaseRequest.acceptedPrices.length === 1) {
      const acceptedPrice = purchaseRequest.acceptedPrices[0];
      if (program.absurdPriceMin !== null && acceptedPrice < program.absurdPriceMin) {
        this.logger.warn('Accepted price below realistic minimum, likely bait — skipping', {
          acceptedPrice,
          absurdPriceMin: program.absurdPriceMin,
          programName: program.name,
        });
        return;
      }
      if (program.absurdPriceMax !== null && acceptedPrice > program.absurdPriceMax) {
        this.logger.warn('Accepted price above realistic maximum, likely bait — skipping', {
          acceptedPrice,
          absurdPriceMax: program.absurdPriceMax,
          programName: program.name,
        });
        return;
      }
    }

    const configuredProgramIds = await this.priceTableProvider.getConfiguredProgramIds(loggedInUserId);

    // Determine effective programs (normal and/or liminar) based on miles availability and min quantity
    const effectivePrograms = await this.getEffectivePrograms(
      loggedInUserId,
      program.id,
      program.name,
      purchaseRequest.quantity,
      effectiveCpfCount,
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
        effectiveCpfCount,
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

    // Fetch settings once — used for group dedup, PM dedup, and counter-offer logic below
    const counterOfferSettings = await this.counterOfferSettingsRepository.getSettings(loggedInUserId);

    // Group message dedup check (after parse, before any response)
    if (counterOfferSettings?.groupDedupEnabled && senderId) {
      const groupKey = `grp:${loggedInUserId}:${senderId}:${chatId}:${purchaseRequest.airlineId}:${purchaseRequest.quantity}:${effectiveCpfCount}`;
      const ttlMs = counterOfferSettings.groupDedupWindowMinutes * 60 * 1000;
      if (this.privateMessageBuffer.shouldSkip(groupKey, ttlMs)) {
        this.logger.log('Group dedup: skipping duplicate request', {
          senderId,
          chatId,
          airlineId: purchaseRequest.airlineId,
          quantity: purchaseRequest.quantity,
          cpfCount: effectiveCpfCount,
        });
        return;
      }
    }

    this.logger.log('Message to reply:', messageId);

    // Apply anti-bot delay before sending any response
    await this.applyDelay(loggedInUserId, chatId);

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
        effectiveCpfCount,
        this.formatPrivatePrice(pricesForCTA),
      );

      if (counterOfferSettings.dedupEnabled) {
        const key = `${loggedInUserId}:${senderId}:cta`;
        const ttlMs = counterOfferSettings.dedupWindowMinutes * 60 * 1000;
        if (this.privateMessageBuffer.shouldSkip(key, ttlMs)) {
          return;
        }
      }

      // Check blacklist before sending private message
      const isCtaBlocked = await this.blacklistRepository.isBlocked(loggedInUserId, senderId, 'private');
      if (isCtaBlocked) {
        this.logger.warn('Sender is blacklisted (private scope), skipping call to action', { senderId });
        return;
      }

      this.logger.log('Sending call to action to buyer in private', {
        senderId,
        templateId,
        lowestPrice,
      });

      await this.tdlibUserClient.sendMessageToUser(telegramUserId, senderId, message);

      return;
    }

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
      effectiveCpfCount,
      this.formatPrivatePrice(calculatedPrices),
    );

    if (counterOfferSettings.dedupEnabled) {
      const key = `${loggedInUserId}:${senderId}:counterOffer`;
      const ttlMs = counterOfferSettings.dedupWindowMinutes * 60 * 1000;
      if (this.privateMessageBuffer.shouldSkip(key, ttlMs)) {
        return;
      }
    }

    // Check blacklist before sending private counter-offer
    const isCounterOfferBlocked = await this.blacklistRepository.isBlocked(loggedInUserId, senderId, 'private');
    if (isCounterOfferBlocked) {
      this.logger.warn('Sender is blacklisted (private scope), skipping counter offer', { senderId });
      return;
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
   * Applies anti-bot delay before sending messages if configured for this group.
   * Fetches per-group delay setting, falls back to global defaults.
   */
  private async applyDelay(userId: string, chatId: number): Promise<void> {
    const groupSetting = await this.groupDelaySettingsRepository.getGroupDelaySetting(userId, chatId);

    if (!groupSetting || !groupSetting.delayEnabled) {
      return;
    }

    // Use group-specific range or fall back to global defaults
    let min: number;
    let max: number;

    if (groupSetting.delayMin !== null && groupSetting.delayMax !== null) {
      min = groupSetting.delayMin;
      max = groupSetting.delayMax;
    } else {
      const defaults = await this.botPreferenceRepository.getDelayDefaults(userId);
      min = defaults.delayMin;
      max = defaults.delayMax;
    }

    if (min === 0 && max === 0) {
      return;
    }

    const delaySeconds = min + Math.random() * (max - min);
    const delayMs = Math.round(delaySeconds * 1000);

    this.logger.log('Applying anti-bot delay', { chatId, delaySeconds: delaySeconds.toFixed(1), min, max });

    await new Promise((resolve) => setTimeout(resolve, delayMs));
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
