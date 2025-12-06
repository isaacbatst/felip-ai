import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { MessageParserAdapter } from "../adapters/message-parser-adapter.js";
import type { PriceTableResultV2 } from "../services/google-sheets.js";
import { DEFAULT_PARSER_CONFIG } from "../services/message-parser.js";
import type { PriceTableV2 } from "../types/price.js";
import type { MilesProgram } from "../utils/miles-programs.js";
import { createMessageHandler, type MessageContext, type MessageHandlerDependencies, type MessageParser, type PriceTableProvider } from "./message-handler.js";

describe("createMessageHandler", () => {
	// Mock price table v2 for testing (apenas quantidade e preço, todos para 1 CPF)
	const mockPriceTableV2: PriceTableV2 = {
		30: 17, // 1 CPF, 30k milhas por R$ 17
		60: 16, // 1 CPF, 60k milhas por R$ 16
	};

	// Helper para criar mock de availableMiles por programa
	const createMockAvailableMiles = (overrides: Partial<Record<MilesProgram, number | null>> = {}) => {
		const defaultMiles: Record<MilesProgram, number | null> = {
			LATAM_PASS: null,
			SMILES: null,
			TUDO_AZUL: null,
			LIVELO: null,
			ESFERA: null,
			INTER_LOOP: null,
			ITAU_SEMPRE_PRESENTE: null,
			CAIXA_ELO: null,
			CAIXA_MAIS: null,
		};
		return { ...defaultMiles, ...overrides };
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
				availableMiles: createMockAvailableMiles({
					LATAM_PASS: 100, // More than requested quantity (LATAM será normalizado para LATAM_PASS)
				}),
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

	it("should not respond when no miles are available for the requested program", async () => {
		// Mock purchase request with SMILES
		const mockPurchaseRequest = {
			isPurchaseProposal: true,
			quantity: 30,
			cpfCount: 1,
			airline: "SMILES",
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

		// Mock price table provider - SMILES has no miles available (null)
		const mockPriceTableProvider: PriceTableProvider = {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: createMockAvailableMiles({
					LATAM_PASS: 100,
					SMILES: null, // No miles available
				}),
			}),
		};

		// Mock ctx.reply
		const mockReply = vi.fn().mockResolvedValue(undefined);

		// Mock MessageContext (minimal interface)
		const mockCtx: MessageContext = {
			message: {
				text: "Quero 30k milhas SMILES para 1 CPF",
				message_id: 789,
			},
			from: {
				id: 101112,
			},
			chat: {
				id: 131415,
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

		// Assertions - should not respond when no miles available for program
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).not.toHaveBeenCalled();
	});

	it("should not respond when requested quantity exceeds available miles for the program", async () => {
		// Mock purchase request with LATAM
		const mockPurchaseRequest = {
			isPurchaseProposal: true,
			quantity: 100, // More than available
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

		// Mock price table provider - LATAM has only 50k available
		const mockPriceTableProvider: PriceTableProvider = {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: createMockAvailableMiles({
					LATAM_PASS: 50, // Less than requested (100)
				}),
			}),
		};

		// Mock ctx.reply
		const mockReply = vi.fn().mockResolvedValue(undefined);

		// Mock MessageContext (minimal interface)
		const mockCtx: MessageContext = {
			message: {
				text: "Quero 100k milhas LATAM para 1 CPF",
				message_id: 999,
			},
			from: {
				id: 111,
			},
			chat: {
				id: 222,
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

		// Assertions - should not respond when quantity exceeds available
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).not.toHaveBeenCalled();
	});

	it("should handle different miles programs correctly", async () => {
		// Mock purchase request with SMILES
		const mockPurchaseRequest = {
			isPurchaseProposal: true,
			quantity: 30,
			cpfCount: 1,
			airline: "SMILES",
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

		// Mock price table provider - SMILES has miles available
		const mockPriceTableProvider: PriceTableProvider = {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: createMockAvailableMiles({
					SMILES: 100, // More than requested
				}),
			}),
		};

		// Mock ctx.reply
		const mockReply = vi.fn().mockResolvedValue(undefined);

		// Mock MessageContext (minimal interface)
		const mockCtx: MessageContext = {
			message: {
				text: "Quero 30k milhas SMILES para 1 CPF",
				message_id: 333,
			},
			from: {
				id: 444,
			},
			chat: {
				id: 555,
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

		// Assertions - should respond when program has available miles
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).toHaveBeenCalledOnce();
		const replyCall = mockReply.mock.calls[0];
		expect(replyCall).toBeDefined();
		if (replyCall) {
			expect(replyCall[0]).toContain("💰 Cotação");
			expect(replyCall[0]).toContain("SMILES");
			expect(replyCall[0]).toContain("30k milhas");
		}
	});
});
