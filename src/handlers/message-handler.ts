import { calculatePrice } from "../domain/price-calculator.js";
import { formatQuoteResponse } from "../formatters/quote-formatter.js";
import type { PriceTableResultV2 } from "../services/google-sheets.js";
import type { PurchaseRequest } from "../types/purchase.js";
import type { MilesProgram } from "../utils/miles-programs.js";
import { validatePurchaseRequest } from "../utils/validation.js";

/**
 * Minimal interface for parsing messages (ISP - Interface Segregation Principle)
 * Only exposes what the handler needs
 */
export interface MessageParser {
	parse(text: string): Promise<PurchaseRequest | null>;
}

/**
 * Minimal interface for getting price table data v2 (ISP - Interface Segregation Principle)
 * Only exposes what the handler needs, not the full cache interface
 */
export interface PriceTableProvider {
	getPriceTable(): Promise<PriceTableResultV2>;
}

/**
 * Minimal interface for message context (ISP - Interface Segregation Principle)
 * Only exposes what the handler needs from the Telegram context
 */
export interface MessageContext {
	message?: {
		text?: string;
		message_id: number;
	} | null;
	from?: {
		id?: number;
	} | null;
	chat?: {
		id?: number;
	} | null;
	reply(
		text: string,
		options?: { reply_to_message_id?: number },
	): Promise<unknown>;
}

/**
 * Dependências do handler de mensagens (DIP - Dependency Inversion Principle)
 * Depende de abstrações (interfaces), não de implementações concretas
 */
export interface MessageHandlerDependencies {
	messageParser: MessageParser;
	priceTableProvider: PriceTableProvider;
}

export const createMessageHandler =
	(deps: MessageHandlerDependencies) =>
	async (ctx: MessageContext): Promise<void> => {
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
			console.log(
				"[DEBUG] message-handler: No text found in message, skipping",
			);
			return;
		}

		console.log("[DEBUG] message-handler: Parsing message...");
		const purchaseRequest = await deps.messageParser.parse(text);
		console.log("[DEBUG] message-handler: Parse result:", purchaseRequest);

		console.log("[DEBUG] message-handler: Validating purchase request...");
		const validatedRequest = validatePurchaseRequest(purchaseRequest);
		console.log(
			"[DEBUG] message-handler: Validation result:",
			validatedRequest,
		);

		if (!validatedRequest) {
			console.log(
				"[DEBUG] message-handler: Validation failed, not a purchase request or missing data",
			);
			return;
		}

		// Após validação, revalida para garantir dados atualizados
		console.log("[DEBUG] message-handler: Getting price table data v2...");
		const priceTableResult = await deps.priceTableProvider.getPriceTable();
		const { priceTable, availableMiles, customMaxPrice } = priceTableResult;

		// Verifica se há um programa de milhas especificado
		const milesProgram = validatedRequest.milesProgram ?? getHighestAvailableMilesProgram(availableMiles)[0]

		const programAvailableMiles = availableMiles[milesProgram]
		// Se não houver milhas registradas ou disponíveis para o programa, não responde
		if (programAvailableMiles === null || programAvailableMiles === undefined) {
			console.log(
				"[DEBUG] message-handler: No miles registered for program, not responding",
				{
					program: milesProgram,
				},
			);
			return;
		}

		// Verifica se a quantidade solicitada excede as milhas disponíveis para o programa
		if (validatedRequest.quantity > programAvailableMiles) {
			console.log(
				"[DEBUG] message-handler: Requested quantity exceeds available miles for program, not responding",
				{
					program: milesProgram,
					requested: validatedRequest.quantity,
					available: programAvailableMiles,
				},
			);
			return;
		}

		console.log("[DEBUG] message-handler: Calculating price v2...", {
			requestedQuantity: validatedRequest.quantity,
			cpfCount: validatedRequest.cpfCount,
			airline: validatedRequest.airline,
			customMaxPrice,
		});
		const priceResult = calculatePrice(
			validatedRequest.quantity,
			validatedRequest.cpfCount,
			priceTable,
			customMaxPrice !== undefined ? { customMaxPrice } : undefined,
		);
		console.log(
			"[DEBUG] message-handler: Price calculation result:",
			priceResult,
		);

		if (!priceResult.success) {
			console.log(
				"[DEBUG] message-handler: Price calculation failed:",
				priceResult.reason,
			);
			return;
		}

		console.log("[DEBUG] message-handler: Formatting response...");
		const formattedResponse = formatQuoteResponse(
			validatedRequest.quantity,
			validatedRequest.cpfCount,
			priceResult.price,
			milesProgram,
		);
		console.log(
			"[DEBUG] message-handler: Formatted response:",
			formattedResponse,
		);

		console.log("[DEBUG] message-handler: Sending reply to user...");
		const replyOptions = ctx.message?.message_id
			? { reply_to_message_id: ctx.message.message_id }
			: undefined;
		await ctx.reply(formattedResponse, replyOptions);
		console.log("[DEBUG] message-handler: Reply sent successfully");
	};

const getHighestAvailableMilesProgram = (
	availableMiles: Record<MilesProgram, number | null>,
): [MilesProgram, number] => {
	let highestAvailableMiles: [MilesProgram, number] = ["LATAM_PASS", 0];
	for (const [program, miles] of Object.entries(availableMiles)) {
		if (miles && miles > highestAvailableMiles[1]) {
			highestAvailableMiles = [program as MilesProgram, miles];
		}
	}

	console.log(
		"[DEBUG] message-handler: Highest available miles:",
		highestAvailableMiles,
	);
	return highestAvailableMiles;
};
