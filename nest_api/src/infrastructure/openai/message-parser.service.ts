import { Injectable, Logger } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { MessageParser, type ProgramOption } from '../../domain/interfaces/message-parser.interface';
import {
  type PurchaseProposal,
  RawDataExtractionRequestSchema,
  type RawDataExtractionOutput,
} from '../../domain/types/purchase.types';
import { ProviderExtractionUtil } from '../../domain/utils/provider-extraction.util';
import { QuantityNormalizationUtil } from '../../domain/utils/quantity-normalization.util';
import { PriceNormalizationUtil } from '../../domain/utils/price-normalization.util';
import { OpenAIService } from './openai.service';
import { PromptConfigRepository } from '../persistence/prompt-config.repository';

/**
 * Configuração do parser de mensagens
 */
export interface MessageParserConfig {
  model: string;
}

/**
 * Service responsável por fazer parsing de mensagens usando OpenAI
 * Extends MessageParser (DIP - Dependency Inversion Principle)
 * Single Responsibility: apenas parsing de mensagens
 *
 * Two-step approach:
 * 1. Extract provider using keyword matching (no AI)
 * 2. If provider found, extract other data using AI
 */
@Injectable()
export class MessageParserService extends MessageParser {
  private readonly config: MessageParserConfig;
  private readonly logger = new Logger(MessageParserService.name);
  private static readonly PROMPT_CONFIG_KEY = 'message_parser_data';
  private static readonly DEFAULT_PROMPT_ID = 'pmpt_6973c179c1848197bdaec0682b4096c00a35b58437df78f2';
  private static readonly DEFAULT_VERSION = '32';
  private static readonly TRAP_DETECTION_PROMPT_KEY = 'trap_detection';
  private static readonly TRAP_DETECTION_MODEL = 'gpt-5-mini';
  private static readonly TRAP_DETECTION_PROMPT_ID = 'pmpt_69a9e0322b7c8194b74149bd9d36bd4304dd3d8086f259d8';
  private static readonly TRAP_DETECTION_PROMPT_VERSION = '2';

  private static readonly TrapDetectionSchema = z.object({
    isTrap: z.boolean().describe('true se a mensagem é armadilha/isca, false se é demanda legítima'),
  });

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly promptConfigRepository: PromptConfigRepository,
  ) {
    super();
    this.config = {
      model: 'gpt-5-nano',
    };
  }

  async parse(text: string, programs?: ProgramOption[], reasoningEffort: 'minimal' | 'high' = 'minimal'): Promise<PurchaseProposal[] | null> {
    try {
      this.logger.log('Parsing message', { text });

      // Step 1: Extract provider using keyword matching
      const airlineId = ProviderExtractionUtil.extractProvider(text, programs);

      if (airlineId === null) {
        this.logger.log('No provider found in message');
        return null;
      }

      this.logger.log('Provider found via keyword matching', { airlineId });

      // Step 2 (precise mode only): AI trap detection before expensive extraction
      if (reasoningEffort === 'high') {
        const isTrap = await this.detectTrap(text);
        if (isTrap) {
          this.logger.warn('AI trap detection flagged message as trap', { text });
          return null;
        }
      }

      // Step 3: Extract other data using AI (only if provider found)
      const data = await this.extractDataWithAI(text, reasoningEffort);

      if (!data || !data.isPurchaseProposal) {
        this.logger.log('AI extraction returned non-purchase proposal');
        return null;
      }

      const proposals: PurchaseProposal[] = [];

      for (const proposal of data.proposals) {
        const quantity = QuantityNormalizationUtil.parse(proposal.rawQuantity);

        if (quantity === null) {
          this.logger.warn('Skipping proposal: quantity invalid or below 1000', {
            rawQuantity: proposal.rawQuantity,
          });
          continue;
        }

        const acceptedPrices = proposal.rawPrices
          .map((r) => PriceNormalizationUtil.parse(r))
          .filter((p): p is number => p !== null);

        proposals.push({
          isPurchaseProposal: true as const,
          quantity,
          cpfCount: proposal.cpfCount,
          airlineId,
          acceptedPrices,
        });
      }

      return proposals.length > 0 ? proposals : null;
    } catch (error) {
      this.logger.error('[ERROR] Error parsing message with GPT:', { error });
      return null;
    }
  }

  /**
   * Extract data (quantity, cpfCount, acceptedPrices) using AI
   */
  private async extractDataWithAI(text: string, reasoningEffort: 'minimal' | 'high' = 'minimal'): Promise<RawDataExtractionOutput | null> {
    const client = this.openaiService.getClient();

    const promptConfig = await this.promptConfigRepository.getByKey(
      MessageParserService.PROMPT_CONFIG_KEY,
    );
    const promptId = promptConfig?.promptId ?? MessageParserService.DEFAULT_PROMPT_ID;
    const version = promptConfig?.version ?? MessageParserService.DEFAULT_VERSION;

    const response = await client.responses.parse({
      model: this.config.model,
      prompt: {
        id: promptId,
        version,
        variables: {
          text
        }
      },
      reasoning: {
        effort: reasoningEffort,
      },
      text: {
        verbosity: 'low',
        format: zodTextFormat(RawDataExtractionRequestSchema, 'dataExtraction'),
      },
    });

    const parsed = response.output_parsed;

    this.logger.log('[PARSED] AI extraction result:', parsed);

    if (!parsed || !parsed.output.isPurchaseProposal) {
      return null;
    }

    return parsed.output;
  }

  /**
   * AI-based trap detection (precise mode only).
   * Returns true if the message is likely a trap/bait, false if legitimate.
   * Fail-closed: returns true (blocks message) on any error.
   */
  private async detectTrap(text: string): Promise<boolean> {
    try {
      const client = this.openaiService.getClient();

      const start = Date.now();

      const promptConfig = await this.promptConfigRepository.getByKey(
        MessageParserService.TRAP_DETECTION_PROMPT_KEY,
      );
      const promptId = promptConfig?.promptId ?? MessageParserService.TRAP_DETECTION_PROMPT_ID;
      const version = promptConfig?.version ?? MessageParserService.TRAP_DETECTION_PROMPT_VERSION;

      const response = await client.responses.parse({
        model: 'gpt-5-mini',
        prompt: {
          id: promptId,
          version,
        },
        input: text,
        reasoning: {
          effort: 'high',
        },
        text: {
          format: zodTextFormat(MessageParserService.TrapDetectionSchema, 'trapDetection'),
        },
      });

      const end = Date.now();
      const duration = end - start;
      
      this.logger.log('Trap detection duration in milliseconds', { duration });

      const parsed = response.output_parsed;

      // log tokens for cost analysis
      this.logger.log('Trap detection tokens', JSON.stringify(response.usage, null, 2));

      if (!parsed) {
        this.logger.warn('Trap detection returned no parsed output, fail-closed');
        return true;
      }

      this.logger.log('Trap detection result', { isTrap: parsed.isTrap, text });
      return parsed.isTrap;
    } catch (error) {
      this.logger.error('Trap detection failed, fail-closed', { error, text });
      return true;
    }
  }
}
