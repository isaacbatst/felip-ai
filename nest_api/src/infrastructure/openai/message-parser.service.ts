import { Injectable, Logger } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { MessageParser } from '../../domain/interfaces/message-parser.interface';
import type { Provider } from '../../domain/types/provider.types';
import { type PurchaseRequest, PurchaseRequestSchema } from '../../domain/types/purchase.types';
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
    }
  }
  async parse(text: string, availableProviders?: Provider[]): Promise<PurchaseRequest | null> {
    try {
      const client = this.openaiService.getClient();
      const variables = {
        providers: availableProviders?.join(', ') || '',
        text: text,
      };
      this.logger.debug('[VARIABLES] Variables:', variables);
      const response = await client.responses.parse({
        model: this.config.model,
        prompt: {
          id: this.promptId,
          version: '5',
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

      if (response.usage) {
        this.logger.debug('[TOKENS] OpenAI usage:', {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          total: response.usage.total_tokens,
        });
      }

      const parsed = response.output_parsed;

      if (!parsed || !parsed.isPurchaseProposal) {
        return null;
      }

      if (
        parsed.quantity === undefined ||
        parsed.cpfCount === undefined ||
        parsed.quantity === null ||
        parsed.cpfCount === null ||
        parsed.quantity <= 0 ||
        parsed.cpfCount <= 0
      ) {
        return null;
      }

      return parsed;
    } catch (error) {
      this.logger.error('[ERROR] Error parsing message with GPT:', error);
      return null;
    }
  }
}
