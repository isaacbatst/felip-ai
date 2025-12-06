import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { MessageParserAdapter } from "../adapters/message-parser-adapter.js";
import type { PriceTableResult } from "../services/google-sheets.js";
import { DEFAULT_PARSER_CONFIG } from "../services/message-parser.js";
import type { PriceTableByCpf } from "../types/price.js";
import { createMessageHandler, type MessageContext, type MessageHandlerDependencies, type MessageParser, type PriceTableProvider } from "./message-handler.js";

describe("createMessageHandler", () => {
	// Mock price table for testing
	const mockPriceTable: PriceTableByCpf = {
		1: {
			30: 17,
			60: 16.5,
			90: 16.25,
			120: 16,
		},
		2: {
			30: 17.5,
			60: 17,
			90: 16.75,
			120: 16.25,
		},
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
			getPriceTable: vi.fn<() => Promise<PriceTableResult>>().mockResolvedValue({
				priceTable: mockPriceTable,
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
			expect(replyCall[0]).toContain("R$ 16.50"); // Price for 60k with 1 CPF
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
			getPriceTable: vi.fn<() => Promise<PriceTableResult>>().mockResolvedValue({
				priceTable: mockPriceTable,
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
			expect(replyCall[0]).toContain("R$ 17.50"); // Price for 30k with 2 CPF
			expect(replyCall[0]).not.toContain("LATAM"); // Should not contain airline
		}
	});
});
