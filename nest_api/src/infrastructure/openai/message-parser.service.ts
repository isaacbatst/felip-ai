import { Injectable } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { MessageParser } from '../../domain/interfaces/message-parser.interface';
import { type PurchaseRequest, PurchaseRequestSchema } from '../../domain/types/purchase.types';
import { OpenAIService } from './openai.service';

/**
 * Configuração do parser de mensagens
 */
export interface MessageParserConfig {
  model: string;
  systemPrompt: string;
}

/**
 * Service responsável por fazer parsing de mensagens usando OpenAI
 * Extends MessageParser (DIP - Dependency Inversion Principle)
 * Single Responsibility: apenas parsing de mensagens
 */
@Injectable()
export class MessageParserService extends MessageParser {
  private readonly config: MessageParserConfig;

  constructor(private readonly openaiService: OpenAIService) {
    super();
    this.config = {
      model: 'gpt-5-nano',
      systemPrompt:
        'Você é um assistente que identifica mensagens de compra de milhas aéreas. ' +
        'Analise a mensagem e identifique se é uma proposta de compra. ' +
        'Se for, extraia a quantidade (em milhares), número de CPFs e companhia aérea. ' +
        "Exemplos de mensagens de compra: 'COMPRO LATAM 27k 2CPF', 'compro 42.6k 1cpf', 'quero comprar 60k latam 3cpf'. " +
        'Se não for uma proposta de compra, retorne isPurchaseProposal: false.',
    };
  }

  async parse(text: string): Promise<PurchaseRequest | null> {
    try {
      const client = this.openaiService.getClient();
      const response = await client.responses.parse({
        model: this.config.model,
        input: [
          {
            role: 'system',
            content: this.config.systemPrompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        text: {
          format: zodTextFormat(PurchaseRequestSchema, 'purchaseRequest'),
        },
      });

      if (response.usage) {
        console.log('[TOKENS] OpenAI usage:', {
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
      console.error('[ERROR] Error parsing message with GPT:', error);
      return null;
    }
  }
}
