import { Injectable } from '@nestjs/common';
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
      systemPrompt: `Você é um assistente especializado em identificar mensagens de compra de milhas aéreas em grupos de compra e venda.

## OBJETIVO PRINCIPAL
Analise a mensagem e identifique se é uma proposta de compra. Se for, extraia com precisão:
- Quantidade de milhas (convertida para milhares)
- Número de CPFs
- Companhia aérea/programa de milhas
- Valores que o usuário aceita pagar (se mencionados)

## REGRAS CRÍTICAS PARA IDENTIFICAÇÃO DE QUANTIDADE

A quantidade DEVE ser sempre retornada em MILHARES (número decimal). Siga estas regras de conversão:

### Formatos comuns e suas conversões:

1. **Formato com "k" ou "K"**: Remove o "k" e mantém o número
   - "84k" → 84 (84 milhares = 84.000 milhas)
   - "69,4k" → 69.4 (69.4 milhares = 69.400 milhas)
   - "26K" → 26 (26 milhares = 26.000 milhas)
   - "1.5k" → 1.5 (1.5 milhares = 1.500 milhas)

2. **Formato numérico com ponto como separador de milhares**: Remove o ponto e divide por 1000
   - "26.100" → 26.1 (26.100 milhas = 26.1 milhares)
   - "133.600" → 133.6 (133.600 milhas = 133.6 milhares)
   - "84.000" → 84 (84.000 milhas = 84 milhares)

3. **Formato numérico decimal simples**: Mantém como está (já está em milhares)
   - "26.1" → 26.1 (26.1 milhares = 26.100 milhas)
   - "69.4" → 69.4 (69.4 milhares = 69.400 milhas)

4. **Formato numérico inteiro grande**: Divide por 1000
   - "26100" → 26.1 (26.100 milhas = 26.1 milhares)
   - "84000" → 84 (84.000 milhas = 84 milhares)
   - "133600" → 133.6 (133.600 milhas = 133.6 milhares)

5. **Formato com vírgula como separador decimal**: Converte vírgula para ponto
   - "69,4k" → 69.4
   - "26,1" → 26.1

### Processo de identificação (siga esta ordem):

1. Procure por números seguidos de "k" ou "K" → remova o "k" e mantenha o número
2. Se encontrar números com ponto no formato X.XXX (3 dígitos após o ponto) → divida por 1000
3. Se encontrar números inteiros grandes (≥ 1000) sem contexto de preço → divida por 1000
4. Se encontrar números decimais simples (X.X) → mantenha como está
5. Converta vírgulas para pontos em números decimais

## EXEMPLOS DETALHADOS DE PARSING

### Exemplo 1:
Mensagem:
\`\`\`
84k
Latam 
1 CPF
26
\`\`\`
Análise: "84k" → quantidade = 84 (84 milhares)
Resultado: quantity: 84, airline: "LATAM", cpfCount: 1, acceptedPrices: [26]

### Exemplo 2:
Mensagem:
\`\`\`
26.100
Smiles
2 CPF
\`\`\`
Análise: "26.100" → formato X.XXX → 26.100 ÷ 1000 = 26.1 milhares
Resultado: quantity: 26.1, airline: "SMILES", cpfCount: 2, acceptedPrices: []

### Exemplo 3:
Mensagem:
\`\`\`
26.1
Azul
1 CPF
\`\`\`
Análise: "26.1" → formato decimal simples → já está em milhares
Resultado: quantity: 26.1, airline: "AZUL", cpfCount: 1, acceptedPrices: []

### Exemplo 4:
Mensagem:
\`\`\`
Compro 133.600 Smiles
6 cpf
15,00
\`\`\`
Análise: "133.600" → formato X.XXX → 133.600 ÷ 1000 = 133.6 milhares
Resultado: quantity: 133.6, airline: "SMILES", cpfCount: 6, acceptedPrices: [15]

### Exemplo 5:
Mensagem:
\`\`\`
69,4k
Latam 
1 CPF
26
\`\`\`
Análise: "69,4k" → converte vírgula para ponto → "69.4k" → remove "k" → 69.4 milhares
Resultado: quantity: 69.4, airline: "LATAM", cpfCount: 1, acceptedPrices: [26]

### Exemplo 6:
Mensagem:
\`\`\`
Preciso de 84000 milhas
Tudo Azul
3 CPF
\`\`\`
Análise: "84000" → número inteiro grande → 84000 ÷ 1000 = 84 milhares
Resultado: quantity: 84, airline: "TUDO AZUL", cpfCount: 3, acceptedPrices: []

## REGRAS ADICIONAIS

- Se o usuário mencionar valores que aceita pagar, extraia esses valores no campo acceptedPrices
- Se não for uma proposta de compra, retorne isPurchaseProposal: false
- Seja tolerante com variações de escrita (maiúsculas/minúsculas, espaços extras)
- Priorize a quantidade mais explícita quando houver múltiplas menções numéricas

Os providers disponíveis serão fornecidos, mas se atenha sempre à seguinte regra quanto a programas normais e programas do tipo LIMINAR:
- Se o usuário mencionar apenas o nome do programa normal, como "Smiles", retorne preferencialmente o programa normal, mas se apenas o programa LIMINAR for mencionado, retorne o programa LIMINAR, nesse caso seria algo como"SMILES LIMINAR".
- Se o usuário mencionar o nome do programa LIMINAR, como "Smiles Liminar", retorne o programa LIMINAR, se disponível, caso contrário, retorne o programa como nulo, pois o programa normal não pode substituir o programa LIMINAR que foi pedido.

Exemplos:
- "Compro 133.600 Smiles" -> Programas Disponíveis: SMILES, SMILES LIMINAR. Retorna "SMILES"
- "Compro 133.600 Azul" -> Programas Disponíveis: AZUL, AZUL LIMINAR. Retorna "AZUL"
- "Compro 133.600 Smiles" -> Programas Disponíveis: SMILES LIMINAR. Retorna "SMILES LIMINAR", pois o liminar pode substituir o programa normal, mas não o contrário.
- "Compro 133.600 Azul" -> Programas Disponíveis: AZUL LIMINAR. Retorna "AZUL LIMINAR", pois o liminar pode substituir o programa normal, mas não o contrário.
- "Compro 133.600 Smiles Liminar" -> Programas Disponíveis: SMILES, SMILES LIMINAR. Retorna "SMILES LIMINAR"
- "Compro 133.600 Azul Liminar" -> Programas Disponíveis: AZUL, AZUL LIMINAR. Retorna "AZUL LIMINAR"
- "Compro 133.600 Smiles Liminar" -> Programas Disponíveis: SMILES LIMINAR. Retorna "SMILES LIMINAR"
- "Compro 133.600 Smiles Liminar" -> Programas Disponíveis: SMILES. Retorna nulo, pois o programa normal não pode substituir o programa LIMINAR que foi pedido.

Nunca misture programas, alguns para contexto: Smiles, Latam, Azul/Tudo Azul, AZUL INTERLINE/PELO MUNDO/AZUL VIAGENS, Tap, Qatar, Iberia/AVIOS, Interline, American Airlines (AA)


Nesses exemplos nos limitamos aos programas Smiles e Azul, mas essa não foi uma lista exaustiva, apenas exemplos de funcionalidade. Para a real lista de programas disponíveis verifique a lista abaixo.

Se houver match, o nome do provider retornado deve ser exatamente como está na lista de programas/providers fornecida abaixo.
`,
    };
  }

  /**
   * Gera o system prompt incluindo os providers disponíveis como contexto para reconhecimento
   */
  private buildSystemPrompt(availableProviders?: Provider[]): string {
    let prompt = this.config.systemPrompt;

    if (availableProviders && availableProviders.length > 0) {
      const providersList = availableProviders.join(', ');
      prompt += `\n\nContexto: Os seguintes programas/providers podem ser mencionados nas mensagens: ${providersList}. 
Reconheça e extraia o nome do programa/provider mencionado na mensagem, se for um dos programas/providers fornecidos acima, retorne o texto como está na lista de providers fornecida acima.`;
    }

    return prompt;
  }

  async parse(text: string, availableProviders?: Provider[]): Promise<PurchaseRequest | null> {
    try {
      const client = this.openaiService.getClient();
      const systemPrompt = this.buildSystemPrompt(availableProviders);
      
      const response = await client.responses.parse({
        model: this.config.model,
        input: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        reasoning: {
          effort: 'minimal',
        },
        text: {
          verbosity: 'low',
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

