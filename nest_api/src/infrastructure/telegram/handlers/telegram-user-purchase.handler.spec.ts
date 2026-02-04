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
import type { PurchaseProposal } from '@/domain/types/purchase.types';

describe('TelegramPurchaseHandler', () => {
  let handler: TelegramPurchaseHandler;
  let mockMessageParser: jest.Mocked<MessageParser>;
  let mockPriceTableProvider: jest.Mocked<PriceTableProvider>;
  let mockTdlibUserClient: jest.Mocked<TelegramUserClientProxyService>;
  let mockCounterOfferSettingsRepository: jest.Mocked<CounterOfferSettingsRepository>;
  let mockMilesProgramRepository: jest.Mocked<MilesProgramRepository>;

  // Test constants
  const loggedInUserId = 'test-logged-in-user-123';
  const telegramUserId = 'test-telegram-user-456';
  const chatId = 123456;
  const messageId = 789;

  // Fake price table data for testing
  // Price table keys are in actual miles (15000 = 15k, 30000 = 30k, etc.)
  const createFakePriceTableResult = (overrides?: Partial<PriceTableResultV2>): PriceTableResultV2 => ({
    priceTables: {
      'SMILES': { 15000: 22, 30000: 20, 50000: 18 },
      'SMILES LIMINAR': { 15000: 23, 30000: 21, 50000: 19 },
      'LATAM': { 15000: 21, 30000: 19, 50000: 17 },
      'LATAM LIMINAR': { 15000: 22, 30000: 20, 50000: 18 },
      'AZUL/TUDO AZUL': { 15000: 20, 30000: 18, 50000: 16 },
      'AZUL LIMINAR': { 15000: 21, 30000: 19, 50000: 17 },
    },
    // availableMiles values are in thousands (50 = 50k miles)
    // This matches the implementation which divides quantity by 1000 before comparing
    availableMiles: {
      'SMILES': 50,
      'SMILES LIMINAR': 30,
      'LATAM': 40,
      'LATAM LIMINAR': 20,
      'AZUL/TUDO AZUL': 60,
      'AZUL LIMINAR': 25,
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

  // Mapping of program names to IDs for tests
  const PROGRAM_IDS = {
    SMILES: 1,
    'SMILES LIMINAR': 2,
    LATAM: 3,
    'LATAM LIMINAR': 4,
    'AZUL/TUDO AZUL': 5,
    'AZUL LIMINAR': 6,
  } as const;

  // Test programs data
  const testPrograms = [
    { id: 1, name: 'SMILES', liminarOfId: null, createdAt: new Date() },
    { id: 2, name: 'SMILES LIMINAR', liminarOfId: 1, createdAt: new Date() },
    { id: 3, name: 'LATAM', liminarOfId: null, createdAt: new Date() },
    { id: 4, name: 'LATAM LIMINAR', liminarOfId: 3, createdAt: new Date() },
    { id: 5, name: 'AZUL/TUDO AZUL', liminarOfId: null, createdAt: new Date() },
    { id: 6, name: 'AZUL LIMINAR', liminarOfId: 5, createdAt: new Date() },
  ];

  // Helper to create a mock PurchaseProposal
  const createPurchaseProposal = (overrides?: Partial<Omit<PurchaseProposal, 'isPurchaseProposal'>>): PurchaseProposal => ({
    isPurchaseProposal: true,
    quantity: 30_000,
    cpfCount: 1,
    airlineId: PROGRAM_IDS.SMILES,
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
      getAllPrograms: jest.fn().mockResolvedValue(testPrograms),
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
            'SMILES': 50, // Has enough for 30k request (50k > 30k)
            'SMILES LIMINAR': 30,
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockPriceTableProvider.getPriceTable).toHaveBeenCalledWith(loggedInUserId);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('20'); // Price for 30k quantity
      });

      it('should use LATAM provider when requested and has enough miles', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.LATAM,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'LATAM 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('19'); // LATAM price for 30k
      });

      it('should use AZUL/TUDO AZUL provider when requested', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['AZUL/TUDO AZUL'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'AZUL 30k 1CPF');

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
            'SMILES': 10, // Not enough for 30k request (10k < 30k)
            'SMILES LIMINAR': 50, // Has enough (50k > 30k)
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('21 LIMINAR'); // SMILES LIMINAR price for 30k
      });

      it('should fallback to LATAM LIMINAR when LATAM has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50,
            'SMILES LIMINAR': 30,
            'LATAM': 10, // Not enough (10k < 30k)
            'LATAM LIMINAR': 50, // Has enough (50k > 30k)
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.LATAM,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'LATAM 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('20 LIMINAR'); // LATAM LIMINAR price for 30k
      });

      it('should fallback to AZUL LIMINAR when AZUL/TUDO AZUL has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50,
            'SMILES LIMINAR': 30,
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 10, // Not enough (10k < 30k)
            'AZUL LIMINAR': 50, // Has enough (50k > 30k)
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['AZUL/TUDO AZUL'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'AZUL 30k 1CPF');

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
            'SMILES': 10, // Not enough for 100k (10k < 100k)
            'SMILES LIMINAR': 50, // Not enough for 100k (50k < 100k)
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 100_000, // 100k requires 100 in availableMiles units
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 100k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when normal has no miles and liminar also insufficient', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 0,
            'SMILES LIMINAR': 20, // Not enough for 30k (20k < 30k)
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('User requests liminar directly', () => {
      it('should send price with LIMINAR suffix when user requests SMILES LIMINAR directly', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['SMILES LIMINAR'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toContain('LIMINAR');
        expect(sentMessage).toBe('21 LIMINAR');
      });

      it('should not send message when user requests liminar directly but it has insufficient miles', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 50,
            'SMILES LIMINAR': 10, // Not enough for 30k (10k < 30k)
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['SMILES LIMINAR'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('User accepts specific prices', () => {
      it('should send "Vamos!" when user accepts price higher than calculated', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25], // User accepts 25, calculated is 20
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          'Vamos!',
          messageId,
        );
      });

      it('should send "Vamos!" when user accepts price equal to calculated', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [20], // User accepts exactly 20
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 20');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          'Vamos!',
          messageId,
        );
      });

      it('should send calculated price when user accepts price lower than calculated (counter offer enabled)', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15], // User accepts 15, calculated is 20
        }));

        // Counter offer must be enabled and threshold >= 5 (price diff is 20-15=5)
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const senderId = 999;
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15', senderId);

        // Should send calculated price in group AND counter offer in private
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(2);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20');
      });

      it('should not send message when user accepts price lower than calculated and counter offer is disabled', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15], // User accepts 15, calculated is 20
        }));

        // Counter offer disabled (default mock returns null)
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send default price message in group when user accepts price lower than calculated but difference exceeds threshold', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [10], // User accepts 10, calculated is 20 (diff = 10)
        }));

        // Counter offer enabled but threshold is 5 (diff 10 > threshold 5)
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5, // Threshold is 5, but difference is 10
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 10');

        // Should send default price message in group (but NOT counter offer in private)
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20'); // Default calculated price
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          '20',
          messageId,
        );
      });

      it('should use minimum of multiple accepted prices for comparison', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25, 22, 30], // Min is 22, still >= 20
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 22');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: 999, // Non-existent program ID
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'UNKNOWN_AIRLINE 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

    });

    describe('Invalid purchase request', () => {
      it('should not send message when parser returns null', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(null);

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'random text');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      // Note: Tests for null quantity, cpfCount, and airlineId were removed because
      // the discriminated union schema now enforces these fields as required when
      // isPurchaseProposal is true. The parser returns null for invalid proposals.

      it('should not send message when quantity is zero', async () => {
        const priceTableResult = createFakePriceTableResult();
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 0,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 0k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('Price calculation with multiple CPFs', () => {
      it('should calculate price correctly with multiple CPFs', async () => {
        const priceTableResult = createFakePriceTableResult({
          availableMiles: {
            'SMILES': 100, // Enough for 60k request (100k > 60k)
            'SMILES LIMINAR': 30,
            'LATAM': 40,
            'LATAM LIMINAR': 20,
            'AZUL/TUDO AZUL': 60,
            'AZUL LIMINAR': 25,
          },
        });
        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 60_000, // 60k / 2 CPFs = 30k per CPF
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 60k 2CPF');

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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 15_000, // Smallest quantity would normally give highest price (22)
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('19'); // Limited by customMaxPrice
      });
    });

    describe('Empty price table', () => {
      it('should not send message when price table is empty for provider (provider is not in availableProviders)', async () => {
        // Note: When a provider has an empty price table, it's filtered out from availableProviders.
        // Therefore, the provider lookup will return null and no message is sent.
        const priceTableResult = createFakePriceTableResult({
          priceTables: {
            'SMILES': {}, // Empty price table - will be filtered out
            'SMILES LIMINAR': { 15000: 23, 30000: 21, 50000: 19 },
            'LATAM': { 15000: 21, 30000: 19, 50000: 17 },
            'LATAM LIMINAR': { 15000: 22, 30000: 20, 50000: 18 },
            'AZUL/TUDO AZUL': { 15000: 20, 30000: 18, 50000: 16 },
            'AZUL LIMINAR': { 15000: 21, 30000: 19, 50000: 17 },
          },
        });

        mockPriceTableProvider.getPriceTable.mockResolvedValue(priceTableResult);
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposal({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        // No message sent because SMILES is not in availableProviders (empty price table)
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });
  });

});
