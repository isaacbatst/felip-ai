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

	// Factory functions to reduce code duplication
	const createMockOpenAIClient = (purchaseRequest: {
		isPurchaseProposal: boolean;
		quantity: number;
		cpfCount: number;
		airline: string;
	}): OpenAI => {
		return {
			responses: {
				parse: vi.fn().mockResolvedValue({
					output_parsed: purchaseRequest,
					usage: {
						input_tokens: 10,
						output_tokens: 5,
						total_tokens: 15,
					},
				}),
			},
		} as unknown as OpenAI;
	};

	const createMessageParser = (openAIClient: OpenAI): MessageParser => {
		return new MessageParserAdapter(openAIClient, DEFAULT_PARSER_CONFIG);
	};

	const createMockPriceTableProvider = (
		overrides: Partial<PriceTableResultV2> = {},
	): PriceTableProvider => {
		return {
			getPriceTable: vi.fn<() => Promise<PriceTableResultV2>>().mockResolvedValue({
				priceTable: mockPriceTableV2,
				availableMiles: createMockAvailableMiles(),
				...overrides,
			}),
		};
	};

	const createMockContext = (
		text: string,
		messageId: number = 123,
		userId: number = 456,
		chatId: number = 789,
	): { ctx: MessageContext; mockReply: ReturnType<typeof vi.fn> } => {
		const mockReply = vi.fn().mockResolvedValue(undefined);
		const ctx: MessageContext = {
			message: {
				text,
				message_id: messageId,
			},
			from: {
				id: userId,
			},
			chat: {
				id: chatId,
			},
			reply: mockReply,
		};
		return { ctx, mockReply };
	};

	const createHandler = (
		purchaseRequest: {
			isPurchaseProposal: boolean;
			quantity: number;
			cpfCount: number;
			airline: string;
		},
		priceTableOverrides: Partial<PriceTableResultV2> = {},
	): {
		handler: ReturnType<typeof createMessageHandler>;
		mockOpenAIClient: OpenAI;
		mockPriceTableProvider: PriceTableProvider;
	} => {
		const mockOpenAIClient = createMockOpenAIClient(purchaseRequest);
		const messageParser = createMessageParser(mockOpenAIClient);
		const mockPriceTableProvider = createMockPriceTableProvider(priceTableOverrides);

		const dependencies: MessageHandlerDependencies = {
			messageParser,
			priceTableProvider: mockPriceTableProvider,
		};

		const handler = createMessageHandler(dependencies);

		return {
			handler,
			mockOpenAIClient,
			mockPriceTableProvider,
		};
	};

	it("should handle a valid purchase request and send a formatted quote response", async () => {
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 60,
			cpfCount: 1,
			airline: "LATAM",
		};

		const { handler, mockOpenAIClient, mockPriceTableProvider } = createHandler(
			purchaseRequest,
			{
				availableMiles: createMockAvailableMiles({
					LATAM_PASS: 100, // More than requested quantity (LATAM será normalizado para LATAM_PASS)
				}),
			},
		);

		const { ctx, mockReply } = createMockContext(
			"Quero comprar 60k milhas LATAM para 1 CPF",
			123,
			456,
			789,
		);

		await handler(ctx);

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
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 30,
			cpfCount: 1,
			airline: "SMILES",
		};

		const { handler, mockPriceTableProvider } = createHandler(purchaseRequest, {
			availableMiles: createMockAvailableMiles({
				LATAM_PASS: 100,
				SMILES: null, // No miles available
			}),
		});

		const { ctx, mockReply } = createMockContext(
			"Quero 30k milhas SMILES para 1 CPF",
			789,
			101112,
			131415,
		);

		await handler(ctx);

		// Assertions - should not respond when no miles available for program
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).not.toHaveBeenCalled();
	});

	it("should not respond when requested quantity exceeds available miles for the program", async () => {
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 100, // More than available
			cpfCount: 1,
			airline: "LATAM",
		};

		const { handler, mockPriceTableProvider } = createHandler(purchaseRequest, {
			availableMiles: createMockAvailableMiles({
				LATAM_PASS: 50, // Less than requested (100)
			}),
		});

		const { ctx, mockReply } = createMockContext(
			"Quero 100k milhas LATAM para 1 CPF",
			999,
			111,
			222,
		);

		await handler(ctx);

		// Assertions - should not respond when quantity exceeds available
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).not.toHaveBeenCalled();
	});

	it("should handle different miles programs correctly", async () => {
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 30,
			cpfCount: 1,
			airline: "SMILES",
		};

		const { handler, mockPriceTableProvider } = createHandler(purchaseRequest, {
			availableMiles: createMockAvailableMiles({
				SMILES: 100, // More than requested
			}),
		});

		const { ctx, mockReply } = createMockContext(
			"Quero 30k milhas SMILES para 1 CPF",
			333,
			444,
			555,
		);

		await handler(ctx);

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

	it("should apply customMaxPrice from C2 cell when provided", async () => {
		// Quantity below minimum (15k < 30k minimum) will trigger extrapolation,
		// and customMaxPrice should limit it
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 15,
			cpfCount: 1,
			airline: "LATAM",
		};

		const { handler, mockPriceTableProvider } = createHandler(purchaseRequest, {
			availableMiles: createMockAvailableMiles({
				LATAM_PASS: 100,
			}),
			customMaxPrice: 17.25, // Custom max price from C2 cell
		});

		const { ctx, mockReply } = createMockContext(
			"Quero comprar 15k milhas LATAM para 1 CPF",
			777,
			888,
			999,
		);

		await handler(ctx);

		// Assertions - should respond and apply customMaxPrice
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).toHaveBeenCalledOnce();
		const replyCall = mockReply.mock.calls[0];
		expect(replyCall).toBeDefined();
		if (replyCall) {
			expect(replyCall[0]).toContain("💰 Cotação");
			expect(replyCall[0]).toContain("LATAM");
			expect(replyCall[0]).toContain("15k milhas");
			// Price should be limited by customMaxPrice (17.25)
			// Since 15k < 30k minimum, it would extrapolate above 17, but customMaxPrice limits it to 17.25
			expect(replyCall[0]).toContain("R$ 17.25");
		}
	});

	it("should work without customMaxPrice when C2 cell is empty", async () => {
		const purchaseRequest = {
			isPurchaseProposal: true,
			quantity: 60,
			cpfCount: 1,
			airline: "LATAM",
		};

		const { handler, mockPriceTableProvider } = createHandler(purchaseRequest, {
			availableMiles: createMockAvailableMiles({
				LATAM_PASS: 100,
			}),
			// customMaxPrice is undefined (not provided)
		});

		const { ctx, mockReply } = createMockContext(
			"Quero comprar 60k milhas LATAM para 1 CPF",
			1111,
			2222,
			3333,
		);

		await handler(ctx);

		// Assertions - should work normally without customMaxPrice
		expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledOnce();
		expect(mockReply).toHaveBeenCalledOnce();
		const replyCall = mockReply.mock.calls[0];
		expect(replyCall).toBeDefined();
		if (replyCall) {
			expect(replyCall[0]).toContain("💰 Cotação");
			expect(replyCall[0]).toContain("LATAM");
			expect(replyCall[0]).toContain("60k milhas");
			expect(replyCall[0]).toContain("R$ 16.00"); // Normal price calculation
		}
	});
});
