import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramPurchaseHandler } from './telegram-user-purchase.handler';
import { MessageParser } from '@/domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '@/domain/interfaces/price-table-provider.interface';
import { PurchaseValidatorService } from '@/domain/services/purchase-validator.service';
import { PriceCalculatorService } from '@/domain/services/price-calculator.service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import type { PriceTableResultV2 } from '@/domain/types/google-sheets.types';
import type { PurchaseRequest } from '@/domain/types/purchase.types';

describe('TelegramPurchaseHandler', () => {
  let handler: TelegramPurchaseHandler;
  let mockMessageParser: jest.Mocked<MessageParser>;
  let mockPriceTableProvider: jest.Mocked<PriceTableProvider>;
  let mockTdlibUserClient: jest.Mocked<TelegramUserClientProxyService>;
  let mockCounterOfferSettingsRepository: jest.Mocked<CounterOfferSettingsRepository>;
  let mockMilesProgramRepository: jest.Mocked<MilesProgramRepository>;

  // Test constants
  const botUserId = 'test-bot-user-123';
  const chatId = 123456;
  const messageId = 789;

  // Fake price table data for testing
  const createFakePriceTableResult = (overrides?: Partial<PriceTableResultV2>): PriceTableResultV2 => ({
    priceTables: {
      'SMILES': { 15: 22, 30: 20, 50: 18 },
      'SMILES LIMINAR': { 15: 23, 30: 21, 50: 19 },
      'LATAM': { 15: 21, 30: 19, 50: 17 },
      'LATAM LIMINAR': { 15: 22, 30: 20, 50: 18 },
      'AZUL/TUDO AZUL': { 15: 20, 30: 18, 50: 16 },
      'AZUL LIMINAR': { 15: 21, 30: 19, 50: 17 },
    },
    availableMiles: {
      'SMILES': 50000,
      'SMILES LIMINAR': 30000,
      'LATAM': 40000,
      'LATAM LIMINAR': 20000,
      'AZUL/TUDO AZUL': 60000,
      'AZUL LIMINAR': 25000,
    },
    customMaxPrice: {
      'SMILES': 22,
      'SMILES LIMINAR': 23,
      'LATAM': 21,
      'LATAM LIMINAR': 22,
      'AZUL/TUDO AZUL': 20,
      'AZUL LIMINAR': 21,
    },
    ...overrides,
  });

  // Helper to create a mock PurchaseRequest
  const createPurchaseRequest = (overrides?: Partial<PurchaseRequest>): PurchaseRequest => ({
    isPurchaseProposal: true,
    quantity: 30,
    cpfCount: 1,
    airline: 'SMILES',
    acceptedPrices: [],
    ...overrides,
  });

  beforeEach(async () => {
    // Create mocks
    mockMessageParser = {
      parse: jest.fn(),
    } as unknown as jest.Mocked<MessageParser>;

    mockPriceTableProvider = {
      getPriceTable: jest.fn(),
    } as unknown as jest.Mocked<PriceTableProvider>;

    mockTdlibUserClient = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramUserClientProxyService>;

    mockCounterOfferSettingsRepository = {
      getSettings: jest.fn().mockResolvedValue(null),
      upsertSettings: jest.fn(),
    } as unknown as jest.Mocked<CounterOfferSettingsRepository>;

    mockMilesProgramRepository = {
      getProgramByName: jest.fn().mockResolvedValue(null),
      findLiminarFor: jest.fn().mockResolvedValue(null),
      getAllPrograms: jest.fn().mockResolvedValue([]),
      getAllProgramsWithLiminar: jest.fn().mockResolvedValue([]),
      getProgramById: jest.fn().mockResolvedValue(null),
      createProgram: jest.fn(),
      updateProgram: jest.fn(),
      deleteProgram: jest.fn(),
    } as unknown as jest.Mocked<MilesProgramRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramPurchaseHandler,
        PurchaseValidatorService,
        PriceCalculatorService,
        {
          provide: MessageParser,
          useValue: mockMessageParser,
        },
        {
          provide: PriceTableProvider,
          useValue: mockPriceTableProvider,
        },
        {
          provide: TelegramUserClientProxyService,
          useValue: mockTdlibUserClient,
        },
        {
          provide: CounterOfferSettingsRepository,
          useValue: mockCounterOfferSettingsRepository,
        },
        {
          provide: MilesProgramRepository,
          useValue: mockMilesProgramRepository,
        },
      ],
    }).compile();

    handler = module.get<TelegramPurchaseHandler>(TelegramPurchaseHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePurchase', () => {
    describe('Normal provider with enough miles', () => {
      it('should send calculated price without LIMINAR suffix when normal provider has enough miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50000, // Has enough for 30k request
            'SMILES LIMINAR': 30000,
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledWith(botUserId);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('20'); // Price for 30k quantity
      });

      it('should use LATAM provider when requested and has enough miles', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'LATAM',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'LATAM 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('19'); // LATAM price for 30k
      });

      it('should use AZUL/TUDO AZUL provider when requested', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'AZUL/TUDO AZUL',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'AZUL 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('18'); // AZUL price for 30k
      });
    });

    describe('Liminar fallback when normal has insufficient miles', () => {
      it('should fallback to SMILES LIMINAR when SMILES has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 10000, // Not enough for 30k request
            'SMILES LIMINAR': 50000, // Has enough
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('21 LIMINAR'); // SMILES LIMINAR price for 30k
      });

      it('should fallback to LATAM LIMINAR when LATAM has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50000,
            'SMILES LIMINAR': 30000,
            'LATAM': 10000, // Not enough
            'LATAM LIMINAR': 50000, // Has enough
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'LATAM',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'LATAM 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('20 LIMINAR'); // LATAM LIMINAR price for 30k
      });

      it('should fallback to AZUL LIMINAR when AZUL/TUDO AZUL has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50000,
            'SMILES LIMINAR': 30000,
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 10000, // Not enough
            'AZUL LIMINAR': 50000, // Has enough
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'AZUL/TUDO AZUL',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'AZUL 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('19 LIMINAR'); // AZUL LIMINAR price for 30k
      });
    });

    describe('Neither normal nor liminar has enough miles', () => {
      it('should not send message when neither SMILES nor SMILES LIMINAR has enough miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 10000, // Not enough for 100k
            'SMILES LIMINAR': 50000, // Not enough for 100k
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 100, // 100k requires 100000 miles
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 100k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when normal has no miles and liminar also insufficient', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 0,
            'SMILES LIMINAR': 20000, // Not enough for 30k
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('User requests liminar directly', () => {
      it('should send price with LIMINAR suffix when user requests SMILES LIMINAR directly', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES LIMINAR',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('21 LIMINAR');
      });

      it('should not send message when user requests liminar directly but it has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50000,
            'SMILES LIMINAR': 10000, // Not enough for 30k
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES LIMINAR',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('User accepts price higher than calculated', () => {
      it('should send "Vamos!" when user accepts price higher than calculated', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
          acceptedPrices: [25], // User accepts 25, calculated is 20
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          botUserId,
          chatId,
          'Vamos!',
          messageId,
        );
      });

      it('should send "Vamos!" when user accepts price equal to calculated', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
          acceptedPrices: [20], // User accepts exactly 20
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 20');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          botUserId,
          chatId,
          'Vamos!',
          messageId,
        );
      });

      it('should send calculated price when user accepts price lower than calculated (counter offer enabled)', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
          acceptedPrices: [15], // User accepts 15, calculated is 20
        }));

        // Counter offer must be enabled and threshold >= 5 (price diff is 20-15=5)
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: botUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const senderId = 999;
        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15', senderId);

        // Should send calculated price in group AND counter offer in private
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(2);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20');
      });

      it('should not send message when user accepts price lower than calculated and counter offer is disabled', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
          acceptedPrices: [15], // User accepts 15, calculated is 20
        }));

        // Counter offer disabled (default mock returns null)
        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should use minimum of multiple accepted prices for comparison', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
          acceptedPrices: [25, 22, 30], // Min is 22, still >= 20
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 22');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          botUserId,
          chatId,
          'Vamos!',
          messageId,
        );
      });
    });

    describe('Provider not found', () => {
      it('should not send message when provider is not found', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'UNKNOWN_AIRLINE',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'UNKNOWN_AIRLINE 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when airline is null', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: null,
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, '30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('Invalid purchase request', () => {
      it('should not send message when parser returns null', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(null);

        await handler.handlePurchase(botUserId, chatId, messageId, 'random text');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when quantity is null', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: null,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when cpfCount is null', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: null,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when quantity is zero', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 0,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 0k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('Price calculation with multiple CPFs', () => {
      it('should calculate price correctly with multiple CPFs', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 100000, // Enough for 60k request
            'SMILES LIMINAR': 30000,
            'LATAM': 40000,
            'LATAM LIMINAR': 20000,
            'AZUL/TUDO AZUL': 60000,
            'AZUL LIMINAR': 25000,
          },
        });
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 60, // 60k / 2 CPFs = 30k per CPF
          cpfCount: 2,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 60k 2CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20'); // Same as 30k with 1 CPF
      });
    });

    describe('Custom max price (PREÇO TETO)', () => {
      it('should respect custom max price when calculating', async () => {
        const priceTableResult = createFakePriceTableResult({
          customMaxPrice: {
            'SMILES': 19, // Lower than table max
            'SMILES LIMINAR': 23,
            'LATAM': 21,
            'LATAM LIMINAR': 22,
            'AZUL/TUDO AZUL': 20,
            'AZUL LIMINAR': 21,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 15, // Smallest quantity would normally give highest price (22)
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('19'); // Limited by customMaxPrice
      });
    });

    describe('Empty price table', () => {
      it('should not send message when price table is empty for provider (provider is not in availableProviders)', async () => {
        // Note: When a provider has an empty price table, it's filtered out from availableProviders.
        // Therefore, findProviderByName will return null and no message is sent.
        const priceTableResult = createFakePriceTableResult({
          priceTables: {
            'SMILES': {}, // Empty price table - will be filtered out
            'SMILES LIMINAR': { 15: 23, 30: 21, 50: 19 },
            'LATAM': { 15: 21, 30: 19, 50: 17 },
            'LATAM LIMINAR': { 15: 22, 30: 20, 50: 18 },
            'AZUL/TUDO AZUL': { 15: 20, 30: 18, 50: 16 },
            'AZUL LIMINAR': { 15: 21, 30: 19, 50: 17 },
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseRequest({
          quantity: 30,
          cpfCount: 1,
          airline: 'SMILES',
        }));

        await handler.handlePurchase(botUserId, chatId, messageId, 'SMILES 30k 1CPF');

        // No message sent because SMILES is not in availableProviders (empty price table)
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });
  });

  describe('findProviderByName (static)', () => {
    const availableProviders = [
      'SMILES',
      'SMILES LIMINAR',
      'LATAM',
      'LATAM LIMINAR',
      'AZUL/TUDO AZUL',
      'AZUL LIMINAR',
    ];

    it('should find provider with exact match (case-insensitive)', () => {
      expect(TelegramPurchaseHandler.findProviderByName('SMILES', availableProviders)).toBe('SMILES');
      expect(TelegramPurchaseHandler.findProviderByName('smiles', availableProviders)).toBe('SMILES');
      expect(TelegramPurchaseHandler.findProviderByName('Smiles', availableProviders)).toBe('SMILES');
    });

    it('should find liminar provider with exact match', () => {
      expect(TelegramPurchaseHandler.findProviderByName('SMILES LIMINAR', availableProviders)).toBe('SMILES LIMINAR');
      expect(TelegramPurchaseHandler.findProviderByName('smiles liminar', availableProviders)).toBe('SMILES LIMINAR');
    });

    it('should find AZUL/TUDO AZUL provider', () => {
      expect(TelegramPurchaseHandler.findProviderByName('AZUL/TUDO AZUL', availableProviders)).toBe('AZUL/TUDO AZUL');
    });

    it('should return null when provider not found', () => {
      expect(TelegramPurchaseHandler.findProviderByName('UNKNOWN', availableProviders)).toBeNull();
      expect(TelegramPurchaseHandler.findProviderByName('GOL', availableProviders)).toBeNull();
    });

    it('should return null when mentionedProvider is null', () => {
      expect(TelegramPurchaseHandler.findProviderByName(null, availableProviders)).toBeNull();
    });

    it('should return null when mentionedProvider is undefined', () => {
      expect(TelegramPurchaseHandler.findProviderByName(undefined, availableProviders)).toBeNull();
    });

    it('should return null when mentionedProvider is empty string', () => {
      expect(TelegramPurchaseHandler.findProviderByName('', availableProviders)).toBeNull();
    });

    it('should handle whitespace in provider name', () => {
      expect(TelegramPurchaseHandler.findProviderByName('  SMILES  ', availableProviders)).toBe('SMILES');
      expect(TelegramPurchaseHandler.findProviderByName(' SMILES LIMINAR ', availableProviders)).toBe('SMILES LIMINAR');
    });
  });
});
