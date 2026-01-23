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
      systemPrompt: `Você é um assistente especializado em identificar mensagens de COMPRA de milhas aéreas em grupos de compra e venda.

## CONTEXTO IMPORTANTE
No grupo haverão pessoas OFERTANDO e COMPRANDO milhas. Você deve identificar APENAS mensagens de COMPRA, ignorando completamente mensagens de OFERTA.

**CONTEXTO ADICIONAL**: O texto fornecido pode incluir contexto adicional quando a mensagem atual é uma resposta a outra mensagem. Nesse caso, o texto conterá tanto a mensagem original quanto a mensagem atual. Use esse contexto para entender melhor a intenção da mensagem, mas sempre analise a mensagem atual para determinar se é uma compra ou oferta.

## OBJETIVO PRINCIPAL
Analise a mensagem e identifique se é uma proposta de COMPRA. Se for, extraia com precisão:
- Quantidade de milhas (convertida para milhares)
- Número de CPFs
- Companhia aérea/programa de milhas (OBRIGATÓRIO para ser considerada compra)
- Valores que o usuário aceita pagar (se mencionados)

## REGRAS CRÍTICAS PARA DISTINGUIR COMPRA DE OFERTA

### Mensagens de COMPRA devem conter:
1. **OBRIGATORIAMENTE**: Menção explícita a um programa de milhas REAL (ex: "Smiles", "Latam", "Azul", "Tudo Azul", "Tap", "Qatar", "Iberia", "AVIOS", "Interline", "American Airlines", "AA", etc.)
2. Formato típico: quantidade + programa de milhas + número de CPFs
3. Mensagens são geralmente MÍNIMAS e diretas, sem palavras como "compro" ou "preciso"

### Mensagens de OFERTA (NÃO são compras):
1. **NÃO mencionam programa de milhas** - apenas quantidade e CPF
2. **IMPORTANTE**: A palavra "comum" NÃO é um programa de milhas - é apenas uma descrição de tipo de CPF (CPF comum vs CPF empresarial)
3. Formato típico: quantidade + CPF + preço OU apenas quantidade + CPF sem programa

### EXEMPLOS DE MENSAGENS QUE SÃO OFERTAS (NÃO são compras):
- "30k 1 cpf comum" → OFERTA (não menciona programa, "comum" é tipo de CPF, não programa)
- "1 cpf comum 25" → OFERTA (não menciona programa, "comum" é tipo de CPF, não programa)
- "2 cpf a 26" → OFERTA (não menciona programa)
- "50k 2 CPF" → OFERTA (não menciona programa)
- "100k 3 CPF 30" → OFERTA (não menciona programa)
- "Vendo 50k, 2 CPF" → OFERTA (não menciona programa)

### EXEMPLOS DE MENSAGENS QUE SÃO COMPRAS (formato realista e mínimo):
- "10k latam 2cpf" → COMPRA (menciona programa "latam")
- "84k Latam 1 CPF" → COMPRA (menciona programa "Latam")
- "26.100 Smiles 2 CPF" → COMPRA (menciona programa "Smiles")
- "50k Azul 1 CPF" → COMPRA (menciona programa "Azul")
- "100k Smiles 3 CPF" → COMPRA (menciona programa "Smiles")
- "30k Tudo Azul 2cpf" → COMPRA (menciona programa "Tudo Azul")

### REGRA CRÍTICA SOBRE "COMUM":
- "Comum" é uma descrição de TIPO DE CPF (CPF comum vs CPF empresarial)
- "Comum" NÃO é um programa de milhas
- Se a mensagem contém "comum" mas NÃO menciona um programa de milhas real, é OFERTA, não compra
- Exemplos de programas de milhas válidos: Smiles, Latam, Azul, Tudo Azul, Tap, Qatar, Iberia, AVIOS, Interline, American Airlines, AA
- Se não for um dos programas válidos mencionados acima, NÃO é compra

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
84k Latam 1 CPF 26
\`\`\`
Análise: "84k" → quantidade = 84 (84 milhares), menciona programa "Latam"
Resultado: quantity: 84, airline: "LATAM", cpfCount: 1, acceptedPrices: [26]

### Exemplo 2:
Mensagem:
\`\`\`
26.100 Smiles 2 CPF
\`\`\`
Análise: "26.100" → formato X.XXX → 26.100 ÷ 1000 = 26.1 milhares, menciona programa "Smiles"
Resultado: quantity: 26.1, airline: "SMILES", cpfCount: 2, acceptedPrices: []

### Exemplo 3:
Mensagem:
\`\`\`
10k latam 2cpf
\`\`\`
Análise: "10k" → quantidade = 10 (10 milhares), menciona programa "latam"
Resultado: quantity: 10, airline: "LATAM", cpfCount: 2, acceptedPrices: []

### Exemplo 4:
Mensagem:
\`\`\`
133.600 Smiles 6 cpf 15
\`\`\`
Análise: "133.600" → formato X.XXX → 133.600 ÷ 1000 = 133.6 milhares, menciona programa "Smiles"
Resultado: quantity: 133.6, airline: "SMILES", cpfCount: 6, acceptedPrices: [15]

### Exemplo 5:
Mensagem:
\`\`\`
69,4k Latam 1 CPF 26
\`\`\`
Análise: "69,4k" → converte vírgula para ponto → "69.4k" → remove "k" → 69.4 milhares, menciona programa "Latam"
Resultado: quantity: 69.4, airline: "LATAM", cpfCount: 1, acceptedPrices: [26]

### Exemplo 6:
Mensagem:
\`\`\`
84000 Tudo Azul 3 CPF
\`\`\`
Análise: "84000" → número inteiro grande → 84000 ÷ 1000 = 84 milhares, menciona programa "Tudo Azul"
Resultado: quantity: 84, airline: "TUDO AZUL", cpfCount: 3, acceptedPrices: []

### Exemplo 7 (OFERTA - não é compra):
Mensagem:
\`\`\`
30k 1 cpf comum
\`\`\`
Análise: NÃO menciona programa de milhas, apenas "comum" (que é tipo de CPF, não programa)
Resultado: isPurchaseProposal: false (é oferta, não compra)

### Exemplo 8 (OFERTA - não é compra):
Mensagem:
\`\`\`
2 cpf a 26
\`\`\`
Análise: NÃO menciona programa de milhas
Resultado: isPurchaseProposal: false (é oferta, não compra)

## REGRAS ADICIONAIS

- **CRÍTICO**: Se a mensagem NÃO mencionar um programa de milhas REAL e VÁLIDO, retorne isPurchaseProposal: false (é uma oferta, não uma compra)
- **CRÍTICO**: A palavra "comum" NÃO é um programa de milhas - é apenas descrição de tipo de CPF. Mensagens com "comum" mas sem programa de milhas são OFERTAS
- Mensagens são geralmente MÍNIMAS - não espere palavras como "compro" ou "preciso"
- Se o usuário mencionar valores que aceita pagar, extraia esses valores no campo acceptedPrices
- Se não for uma proposta de compra, retorne isPurchaseProposal: false
- Seja tolerante com variações de escrita (maiúsculas/minúsculas, espaços extras)
- Priorize a quantidade mais explícita quando houver múltiplas menções numéricas
- **NUNCA** identifique como compra mensagens que apenas mencionam quantidade e CPF sem programa de milhas
- **NUNCA** confunda "comum" com um programa de milhas

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

