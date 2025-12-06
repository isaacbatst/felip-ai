import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { MessageParserAdapter } from "../adapters/message-parser-adapter.js";
import type { PriceTableResultV2 } from "../services/google-sheets.js";
import { DEFAULT_PARSER_CONFIG } from "../services/message-parser.js";
import type { PriceTableV2 } from "../types/price.js";
import { createMessageHandler, type MessageContext, type MessageHandlerDependencies, type MessageParser, type PriceTableProvider } from "./message-handler.js";

describe("createMessageHandler", () => {
	// Mock price table v2 for testing (apenas quantidade e preço, todos para 1 CPF)
	const mockPriceTableV2: PriceTableV2 = {
		30: 17, // 1 CPF, 30k milhas por R$ 17
		60: 16, // 1 CPF, 60k milhas por R$ 16
	};

	it("should handle a valid purchase request and send a formatted quote response", async () => {
		// Mock purchase request
		const mockPurchaseRequest = {
			isPurchaseProposal: true,
			quantity: 60,
			cpfCount: 1,
			airline: "LATAM",
		};

		// Mock OpenAI client (external service)
		const mockOpenAIClient = {
			responses: {
				parse: vi.fn().mockResolvedValue({
					output_parsed: mockPurchaseRequest,
					usage: {
						input_tokens: 10,
						output_tokens: 5,
						total_tokens: 15,
					},
				}),
			},
		} as unknown as OpenAI;

		// Create real message parser adapter with mocked OpenAI client
		const messageParser: MessageParser = new MessageParserAdapter(mockOpenAIClient, DEFAULT_PARSER_CONFIG);

		// Mock price table provider (external service - Google Sheets)
		const mockPriceTableProvider: PriceTableProvider = {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: 100, // More than requested quantity
			}),
		};

		// Mock ctx.reply
		const mockReply = vi.fn().mockResolvedValue(undefined);

		// Mock MessageContext (minimal interface)
		const mockCtx: MessageContext = {
			message: {
				text: "Quero comprar 60k milhas LATAM para 1 CPF",
				message_id: 123,
			},
			from: {
				id: 456,
			},
			chat: {
				id: 789,
			},
			reply: mockReply,
		};

		// Create handler with real dependencies (only external services mocked)
		const dependencies: MessageHandlerDependencies = {
			messageParser,
			priceTableProvider: mockPriceTableProvider,
		};

		const handler = createMessageHandler(dependencies);

		// Execute handler
		await handler(mockCtx);

		// Assertions
		expect(mockOpenAIClient.responses.parse).toHaveBeenCalledOnce();
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).toHaveBeenCalledOnce();

		// Verify the reply contains expected content
		const replyCall = mockReply.mock.calls[0];
		expect(replyCall).toBeDefined();
		if (replyCall) {
			expect(replyCall[0]).toContain("💰 Cotação");
			expect(replyCall[0]).toContain("LATAM");
			expect(replyCall[0]).toContain("60k milhas");
			expect(replyCall[0]).toContain("1 CPF");
			expect(replyCall[0]).toContain("R$ 16.00"); // Price for 60k with 1 CPF (v2: 60k = 16)
			expect(replyCall[1]).toEqual({
				reply_to_message_id: 123,
			});
		}
	});

	it("should handle a purchase request without airline", async () => {
		// Mock purchase request without airline
		const mockPurchaseRequest = {
			isPurchaseProposal: true,
			quantity: 30,
			cpfCount: 2,
			airline: null,
		};

		// Mock OpenAI client (external service)
		const mockOpenAIClient = {
			responses: {
				parse: vi.fn().mockResolvedValue({
					output_parsed: mockPurchaseRequest,
					usage: {
						input_tokens: 10,
						output_tokens: 5,
						total_tokens: 15,
					},
				}),
			},
		} as unknown as OpenAI;

		// Create real message parser adapter with mocked OpenAI client
		const messageParser: MessageParser = new MessageParserAdapter(mockOpenAIClient, DEFAULT_PARSER_CONFIG);

		// Mock price table provider (external service - Google Sheets)
		const mockPriceTableProvider: PriceTableProvider = {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: 50,
			}),
		};

		// Mock ctx.reply
		const mockReply = vi.fn().mockResolvedValue(undefined);

		// Mock MessageContext (minimal interface)
		const mockCtx: MessageContext = {
			message: {
				text: "Quero 30k milhas para 2 CPFs",
				message_id: 456,
			},
			from: {
				id: 789,
			},
			chat: {
				id: 101112,
			},
			reply: mockReply,
		};

		// Create handler with real dependencies (only external services mocked)
		const dependencies: MessageHandlerDependencies = {
			messageParser,
			priceTableProvider: mockPriceTableProvider,
		};

		const handler = createMessageHandler(dependencies);

		// Execute handler
		await handler(mockCtx);

		// Assertions
		expect(mockReply).toHaveBeenCalledOnce();
		const replyCall = mockReply.mock.calls[0];
		expect(replyCall).toBeDefined();
		if (replyCall) {
			expect(replyCall[0]).toContain("💰 Cotação");
			expect(replyCall[0]).toContain("30k milhas");
			expect(replyCall[0]).toContain("2 CPFs");
			// 2 CPFs com 30k total = 15k por CPF
			// 15k < 30k (mínimo), então extrapola: 17 + (-1/30) * (15 - 30) = 17 + 0.5 = 17.5
			expect(replyCall[0]).toContain("R$ 17.50"); // Price for 30k with 2 CPFs (v2 calculation)
			expect(replyCall[0]).not.toContain("LATAM"); // Should not contain airline
		}
	});
});
