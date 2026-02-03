import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { MessageParser, type ProgramOption } from '../../domain/interfaces/message-parser.interface';
import { type PurchaseProposal, PurchaseRequestSchema } from '../../domain/types/purchase.types';
import { OpenAIService } from './openai.service';

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
 */
@Injectable()
export class MessageParserService extends MessageParser {
  private readonly config: MessageParserConfig;
  private readonly logger = new Logger(MessageParserService.name);
  private readonly promptId = 'pmpt_6973c179c1848197bdaec0682b4096c00a35b58437df78f2';

  constructor(private readonly openaiService: OpenAIService) {
    super();
    this.config = {
      model: 'gpt-5-nano',
    };
  }
  async parse(text: string, programs?: ProgramOption[]): Promise<PurchaseProposal | null> {
    try {
      const client = this.openaiService.getClient();
      const variables = {
        // Format: "1:SMILES, 2:LATAM, 3:AZUL/TUDO AZUL, ..."
        providers: JSON.stringify(programs || []),
        text: text,
      };
      const id = randomUUID();
      this.logger.log('Parsing message', { id, text });
      const response = await client.responses.parse({
        model: this.config.model,
        prompt: {
          id: this.promptId,
          version: '27',
          variables,
        },
        reasoning: {
          effort: 'minimal',
        },
        text: {
          verbosity: 'low',
          format: zodTextFormat(PurchaseRequestSchema, 'purchaseRequest'),
        },
      });

      const parsed = response.output_parsed;

      this.logger.log('[PARSED] Parsed:', { id, ...parsed });

      // Discriminated union ensures that when isPurchaseProposal is true,
      // quantity, cpfCount, and airlineId are all required numbers
      if (!parsed || !parsed.output.isPurchaseProposal) {
        return null;
      }

      return parsed.output;
    } catch (error) {
      this.logger.error('[ERROR] Error parsing message with GPT:', error);
      return null;
    }
  }
}
