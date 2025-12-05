import type { Context } from "grammy";
import { calculatePrice } from "../domain/price-calculator.js";
import { formatQuoteResponse } from "../formatters/quote-formatter.js";
import type { PriceTableByCpf } from "../types/price.js";
import type { PurchaseRequest } from "../types/purchase.js";
import { validatePurchaseRequest } from "../utils/validation.js";

/**
 * Dependências do handler de mensagens
 * Permite dependency injection para testes e flexibilidade
 */
export interface MessageHandlerDependencies {
	parseMessage: (text: string) => Promise<PurchaseRequest | null>;
	priceTable: PriceTableByCpf;
}

export const createMessageHandler =
	(deps: MessageHandlerDependencies) =>
	async (ctx: Context): Promise<void> => {
		console.log("[DEBUG] message-handler: Received message event");
		const text = ctx.message?.text;
		const userId = ctx.from?.id;
		const chatId = ctx.chat?.id;

		console.log("[DEBUG] message-handler: Message details:", {
			userId,
			chatId,
			hasText: !!text,
			textLength: text?.length,
		});

		if (!text) {
			console.log("[DEBUG] message-handler: No text found in message, skipping");
			return;
		}

		console.log("[DEBUG] message-handler: Parsing message with OpenAI...");
		const purchaseRequest = await deps.parseMessage(text);
		console.log("[DEBUG] message-handler: Parse result:", purchaseRequest);

		console.log("[DEBUG] message-handler: Validating purchase request...");
		const validatedRequest = validatePurchaseRequest(purchaseRequest);
		console.log("[DEBUG] message-handler: Validation result:", validatedRequest);

		if (!validatedRequest) {
			console.log("[DEBUG] message-handler: Validation failed, not a purchase request or missing data");
			return;
		}

		console.log("[DEBUG] message-handler: Calculating price...", {
			quantity: validatedRequest.quantity,
			cpfCount: validatedRequest.cpfCount,
			airline: validatedRequest.airline,
		});
		const priceResult = calculatePrice(
			validatedRequest.quantity,
			validatedRequest.cpfCount,
			deps.priceTable,
		);
		console.log("[DEBUG] message-handler: Price calculation result:", priceResult);

		if (!priceResult.success) {
			console.log("[DEBUG] message-handler: Price calculation failed:", priceResult.reason);
			return;
		}

		console.log("[DEBUG] message-handler: Formatting response...");
		const formattedResponse = formatQuoteResponse(
			validatedRequest.quantity,
			validatedRequest.cpfCount,
			priceResult.price,
			validatedRequest.airline,
		);
		console.log("[DEBUG] message-handler: Formatted response:", formattedResponse);

		console.log("[DEBUG] message-handler: Sending reply to user...");
		await ctx.reply(formattedResponse, {
			reply_to_message_id: ctx.message.message_id,
		});
		console.log("[DEBUG] message-handler: Reply sent successfully");
	};

