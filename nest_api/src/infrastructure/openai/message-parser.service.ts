import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { MessageParser, type ProgramOption } from '../../domain/interfaces/message-parser.interface';
import {
  type PurchaseProposal,
  DataExtractionRequestSchema,
  type DataExtractionOutput,
} from '../../domain/types/purchase.types';
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

  async parse(text: string, programs?: ProgramOption[]): Promise<PurchaseProposal | null> {
    const id = randomUUID();

    try {
      this.logger.log('Parsing message', { id, text });

      // Step 1: Extract provider using keyword matching
      const airlineId = this.extractProvider(text, programs);

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

      return {
        isPurchaseProposal: true,
        quantity: data.quantity,
        cpfCount: data.cpfCount,
        airlineId,
        acceptedPrices: data.acceptedPrices,
      };
    } catch (error) {
      this.logger.error('[ERROR] Error parsing message with GPT:', { id, error });
      return null;
    }
  }

  /**
   * Extract provider ID using keyword matching (no AI)
   */
  private extractProvider(text: string, programs?: ProgramOption[]): number | null {
    if (!programs?.length) return null;

    const normalizedText = this.normalizeText(text);
    const hasLiminar = normalizedText.includes('liminar');

    // Sort by keyword length (longer = more specific)
    const sortedPrograms = this.getSortedProgramsBySpecificity(programs);

    for (const program of sortedPrograms) {
      const isLiminarProgram = program.name.toLowerCase().includes('liminar');

      // Skip LIMINAR programs unless "liminar" is in the message
      if (isLiminarProgram && !hasLiminar) continue;

      // Skip non-LIMINAR programs if "liminar" is explicitly mentioned
      if (!isLiminarProgram && hasLiminar) continue;

      const keywords = this.getKeywords(program.name);
      if (keywords.some((kw) => normalizedText.includes(kw))) {
        return program.id;
      }
    }

    return null;
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

  /**
   * Normalize text for keyword matching:
   * - lowercase
   * - remove accents
   * - replace special chars with space
   * - normalize whitespace
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Get keywords from program name by splitting on '/'
   */
  private getKeywords(programName: string): string[] {
    return programName
      .split('/')
      .map((alias) => this.normalizeText(alias))
      .filter(Boolean);
  }

  /**
   * Sort programs by keyword specificity (longer keywords first)
   */
  private getSortedProgramsBySpecificity(programs: ProgramOption[]): ProgramOption[] {
    return [...programs].sort((a, b) => {
      const maxLenA = Math.max(...this.getKeywords(a.name).map((k) => k.length));
      const maxLenB = Math.max(...this.getKeywords(b.name).map((k) => k.length));
      return maxLenB - maxLenA; // Longer keywords first
    });
  }
}
