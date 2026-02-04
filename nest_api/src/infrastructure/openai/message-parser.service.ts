import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { MessageParser, type ProgramOption } from '../../domain/interfaces/message-parser.interface';
import {
  type PurchaseProposal,
  DataExtractionRequestSchema,
  type DataExtractionOutput,
} from '../../domain/types/purchase.types';
import { ProviderExtractionUtil } from '../../domain/utils/provider-extraction.util';
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

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly promptConfigRepository: PromptConfigRepository,
  ) {
    super();
    this.config = {
      model: 'gpt-5-nano',
    };
  }

  async parse(text: string, programs?: ProgramOption[]): Promise<PurchaseProposal[] | null> {
    const id = randomUUID();

    try {
      this.logger.log('Parsing message', { id, text });

      // Step 1: Extract provider using keyword matching
      const airlineId = ProviderExtractionUtil.extractProvider(text, programs);

      if (airlineId === null) {
        this.logger.log('No provider found in message', { id });
        return null;
      }

      this.logger.log('Provider found via keyword matching', { id, airlineId });

      // Step 2: Extract other data using AI (only if provider found)
      const data = await this.extractDataWithAI(text, id);

      if (!data || !data.isPurchaseProposal) {
        this.logger.log('AI extraction returned non-purchase proposal', { id });
        return null;
      }

      return data.proposals.map((proposal) => ({
        isPurchaseProposal: true as const,
        quantity: proposal.quantity,
        cpfCount: proposal.cpfCount,
        airlineId,
        acceptedPrices: proposal.acceptedPrices,
      }));
    } catch (error) {
      this.logger.error('[ERROR] Error parsing message with GPT:', { id, error });
      return null;
    }
  }

  /**
   * Extract data (quantity, cpfCount, acceptedPrices) using AI
   */
  private async extractDataWithAI(text: string, id: string): Promise<DataExtractionOutput | null> {
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
        effort: 'minimal',
      },
      text: {
        verbosity: 'low',
        format: zodTextFormat(DataExtractionRequestSchema, 'dataExtraction'),
      },
    });

    const parsed = response.output_parsed;

    this.logger.log('[PARSED] AI extraction result:', { id, ...parsed });

    if (!parsed || !parsed.output.isPurchaseProposal) {
      return null;
    }

    return parsed.output;
  }
}
