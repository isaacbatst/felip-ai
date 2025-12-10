import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { PurchaseRequest } from "../types/purchase.js";
import { PurchaseRequestSchema } from "../types/purchase.js";

/**
 * Configuração do parser de mensagens
 */
export interface MessageParserConfig {
	model: string;
	systemPrompt: string;
}

/**
 * Cria uma função de parser de mensagens usando dependency injection
 * Permite fácil teste e substituição de dependências
 */
export const createMessageParser =
	(openaiClient: OpenAI, config: MessageParserConfig) =>
	async (text: string): Promise<PurchaseRequest | null> => {
		console.log("[DEBUG] message-parser: Starting parse for text:", text);
		console.log("[DEBUG] message-parser: Using model:", config.model);
		try {
			console.log("[DEBUG] message-parser: Calling OpenAI API...");
			const response = await openaiClient.responses.parse({
				model: config.model,
				input: [
					{
						role: "system",
						content: config.systemPrompt,
					},
					{
						role: "user",
						content: text,
					},
				],
				text: {
					format: zodTextFormat(
						PurchaseRequestSchema,
						"purchaseRequest",
					),
				},
			});

			console.log("[DEBUG] message-parser: OpenAI API response received");
			
			// Log de uso de tokens
			if (response.usage) {
				console.log("[TOKENS] OpenAI usage:", {
					inputTokens: response.usage.input_tokens,
					outputTokens: response.usage.output_tokens,
					total: response.usage.total_tokens,
				});
			} else {
				console.log("[TOKENS] OpenAI usage information not available in response");
			}
			
			const parsed = response.output_parsed;
			console.log("[DEBUG] message-parser: Parsed output:", parsed);

			if (!parsed || !parsed.isPurchaseProposal) {
				console.log("[DEBUG] message-parser: Not a purchase proposal or parsed is null");
				return null;
			}

			// Valida se tem os dados necessários para calcular o preço
			console.log("[DEBUG] message-parser: Validating parsed data...", {
				quantity: parsed.quantity,
				cpfCount: parsed.cpfCount,
				airline: parsed.airline,
			});
			if (
				parsed.quantity === undefined ||
				parsed.cpfCount === undefined ||
				parsed.quantity === null ||
				parsed.cpfCount === null ||
				parsed.quantity <= 0 ||
				parsed.cpfCount <= 0
			) {
				console.log("[DEBUG] message-parser: Validation failed - missing or invalid quantity/cpfCount");
				return null;
			}

			console.log("[DEBUG] message-parser: Parse successful, returning purchase request");
			return parsed;
		} catch (error) {
			console.error("[DEBUG] message-parser: Error parsing message with GPT:", error);
			console.error("Erro ao parsear mensagem com GPT:", error);
			return null;
		}
	};

/**
 * Configuração padrão do parser
 */
export const DEFAULT_PARSER_CONFIG: MessageParserConfig = {
	model: "gpt-5-nano",
	systemPrompt:
		"Você é um assistente que identifica mensagens de compra de milhas aéreas. " +
		"Analise a mensagem e identifique se é uma proposta de compra. " +
		"Se for, extraia a quantidade (em milhares), número de CPFs e companhia aérea. " +
		"Exemplos de mensagens de compra: 'COMPRO LATAM 27k 2CPF', 'compro 42.6k 1cpf', 'quero comprar 60k latam 3cpf'. " +
		"Se não for uma proposta de compra, retorne isPurchaseProposal: false.",
};

