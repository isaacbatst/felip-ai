import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramPurchaseHandler } from './telegram-user-purchase.handler';
import { MessageParser } from '@/domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '@/domain/interfaces/price-table-provider.interface';
import { PurchaseValidatorService } from '@/domain/services/purchase-validator.service';
import { PriceCalculatorService } from '@/domain/services/price-calculator.service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import type { PriceTableV2 } from '@/domain/types/price.types';
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

  // Fake price tables by program ID (keys in thousands to match production format)
  const priceTables: Record<number, PriceTableV2> = {
    1: { 15: 22, 30: 20, 50: 18 }, // SMILES
    2: { 15: 23, 30: 21, 50: 19 }, // SMILES LIMINAR
    3: { 15: 21, 30: 19, 50: 17 }, // LATAM
    4: { 15: 22, 30: 20, 50: 18 }, // LATAM LIMINAR
    5: { 15: 20, 30: 18, 50: 16 }, // AZUL/TUDO AZUL
    6: { 15: 21, 30: 19, 50: 17 }, // AZUL LIMINAR
  };

  // Fake available miles by program ID
  let availableMiles: Record<number, number | null> = {
    1: 50000, // SMILES
    2: 30000, // SMILES LIMINAR
    3: 40000, // LATAM
    4: 20000, // LATAM LIMINAR
    5: 60000, // AZUL/TUDO AZUL
    6: 25000, // AZUL LIMINAR
  };

  // Fake max prices by program ID
  const maxPrices: Record<number, number | null> = {
    1: 22, // SMILES
    2: 23, // SMILES LIMINAR
    3: 21, // LATAM
    4: 22, // LATAM LIMINAR
    5: 20, // AZUL/TUDO AZUL
    6: 21, // AZUL LIMINAR
  };

  // Default configured program IDs
  let configuredProgramIds = [1, 2, 3, 4, 5, 6];

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

  // Helper to create a mock PurchaseProposal array with single element (standard case)
  const createPurchaseProposalArray = (overrides?: Partial<Omit<PurchaseProposal, 'isPurchaseProposal'>>): PurchaseProposal[] => [{
    isPurchaseProposal: true,
    quantity: 30_000,
    cpfCount: 1,
    airlineId: PROGRAM_IDS.SMILES,
    acceptedPrices: [],
    ...overrides,
  }];

  beforeEach(async () => {
    // Reset available miles and configured programs to defaults
    availableMiles = {
      1: 50000, // SMILES
      2: 30000, // SMILES LIMINAR
      3: 40000, // LATAM
      4: 20000, // LATAM LIMINAR
      5: 60000, // AZUL/TUDO AZUL
      6: 25000, // AZUL LIMINAR
    };
    configuredProgramIds = [1, 2, 3, 4, 5, 6];

    // Create mocks
    mockMessageParser = {
      parse: jest.fn(),
    } as unknown as jest.Mocked<MessageParser>;

    mockPriceTableProvider = {
      getPriceTable: jest.fn(),
      getPriceTableForProgram: jest.fn().mockImplementation((_userId: string, programId: number) => {
        return Promise.resolve(priceTables[programId] ?? null);
      }),
      getMaxPriceForProgram: jest.fn().mockImplementation((_userId: string, programId: number) => {
        return Promise.resolve(maxPrices[programId] ?? null);
      }),
      getAvailableMilesForProgram: jest.fn().mockImplementation((_userId: string, programId: number) => {
        return Promise.resolve(availableMiles[programId] ?? null);
      }),
      getConfiguredProgramIds: jest.fn().mockImplementation(() => {
        return Promise.resolve(configuredProgramIds);
      }),
      hasSufficientMiles: jest.fn().mockImplementation((_userId: string, programId: number, quantity: number) => {
        const miles = availableMiles[programId];
        return Promise.resolve(miles !== null && miles !== undefined && miles >= quantity);
      }),
      getMinQuantityForProgram: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PriceTableProvider>;

    mockTdlibUserClient = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendMessageToUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramUserClientProxyService>;

    mockCounterOfferSettingsRepository = {
      getSettings: jest.fn().mockResolvedValue(null),
      upsertSettings: jest.fn(),
    } as unknown as jest.Mocked<CounterOfferSettingsRepository>;

    mockMilesProgramRepository = {
      getProgramByName: jest.fn().mockImplementation((name: string) => {
        const program = testPrograms.find((p) => p.name.toUpperCase() === name.toUpperCase());
        return Promise.resolve(program ?? null);
      }),
      findLiminarFor: jest.fn().mockImplementation((programId: number) => {
        const liminar = testPrograms.find((p) => p.liminarOfId === programId);
        return Promise.resolve(liminar ?? null);
      }),
      getAllPrograms: jest.fn().mockResolvedValue(testPrograms),
      getAllProgramsWithLiminar: jest.fn().mockResolvedValue([]),
      getProgramById: jest.fn().mockImplementation((id: number) => {
        const program = testPrograms.find((p) => p.id === id);
        return Promise.resolve(program ?? null);
      }),
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
        // Using default availableMiles which has SMILES with 50000 (enough for 30k)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockPriceTableProvider.getConfiguredProgramIds).toHaveBeenCalledWith(loggedInUserId);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).not.toContain('LIMINAR');
        expect(sentMessage).toBe('20'); // Price for 30k quantity
      });

      it('should use LATAM provider when requested and has enough miles', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // Set SMILES to have insufficient miles, but SMILES LIMINAR to have enough
        availableMiles[1] = 10000; // SMILES - not enough for 30k
        availableMiles[2] = 50000; // SMILES LIMINAR - has enough

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // Set LATAM to have insufficient miles, but LATAM LIMINAR to have enough
        availableMiles[3] = 10000; // LATAM - not enough
        availableMiles[4] = 50000; // LATAM LIMINAR - has enough

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // Set AZUL to have insufficient miles, but AZUL LIMINAR to have enough
        availableMiles[5] = 10000; // AZUL/TUDO AZUL - not enough
        availableMiles[6] = 50000; // AZUL LIMINAR - has enough

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // Both SMILES and SMILES LIMINAR don't have enough for 100k
        availableMiles[1] = 10000; // SMILES - not enough for 100k
        availableMiles[2] = 50000; // SMILES LIMINAR - not enough for 100k

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 100_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 100k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when normal has no miles and liminar also insufficient', async () => {
        // SMILES has 0 miles, SMILES LIMINAR not enough for 30k
        availableMiles[1] = 0;     // SMILES - no miles
        availableMiles[2] = 20000; // SMILES LIMINAR - not enough for 30k

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // SMILES LIMINAR doesn't have enough for 30k
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough for 30k

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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

        // Should send calculated price in group via sendMessage
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20');

        // Should send counter offer in private via sendMessageToUser
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledWith(
          telegramUserId,
          senderId,
          expect.any(String),
        );
      });

      it('should send calculated price in group when user accepts price lower than calculated and counter offer is disabled', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15], // User accepts 15, calculated is 20
        }));

        // Counter offer disabled (default mock returns null)
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          expect.stringContaining('20'),
          messageId,
        );
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();
      });

      it('should send default price message in group when user accepts price lower than calculated but difference exceeds threshold', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        mockMessageParser.parse.mockResolvedValue(null);

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'random text');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when parser returns empty array', async () => {
        mockMessageParser.parse.mockResolvedValue([]);

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'random text');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when parser returns multiple proposals', async () => {
        // Multiple proposals in a single message should be ignored
        mockMessageParser.parse.mockResolvedValue([
          {
            isPurchaseProposal: true,
            quantity: 30_000,
            cpfCount: 1,
            airlineId: PROGRAM_IDS.SMILES,
            acceptedPrices: [],
          },
          {
            isPurchaseProposal: true,
            quantity: 50_000,
            cpfCount: 2,
            airlineId: PROGRAM_IDS.LATAM,
            acceptedPrices: [],
          },
        ]);

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF e LATAM 50k 2CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      // Note: Tests for null quantity, cpfCount, and airlineId were removed because
      // the discriminated union schema now enforces these fields as required when
      // isPurchaseProposal is true. The parser returns null for invalid proposals.

      it('should not send message when quantity is zero', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // SMILES has enough miles for 60k
        availableMiles[1] = 100000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
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
        // Override the mock for SMILES to return a lower max price
        mockPriceTableProvider.getMaxPriceForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve(19); // Lower than table max
          }
          return Promise.resolve(maxPrices[programId] ?? null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 15_000, // Smallest quantity would normally give highest price (22)
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('19'); // Limited by customMaxPrice
      });

      it('should ignore custom max price when it is 0 (use price table value instead)', async () => {
        // Simulate the bug scenario: user set minQuantity but not maxPrice → backend stores maxPrice=0
        mockPriceTableProvider.getMaxPriceForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve(0); // maxPrice=0 from DB (no max price configured)
          }
          return Promise.resolve(maxPrices[programId] ?? null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20'); // Should use price table value, not 0
      });
    });

    describe('Minimum quantity filter', () => {
      it('should not send message when quantity is below minimum', async () => {
        // Set min quantity for SMILES to 50000 (50k miles)
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000, // 30k < 50k minimum
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send message when quantity meets minimum', async () => {
        // Set min quantity for SMILES to 30000 (30k miles)
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(30_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000, // 30k = 30k minimum (not below)
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('should send message when quantity exceeds minimum', async () => {
        // Set min quantity for SMILES to 20000 (20k miles)
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(20_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000, // 30k > 20k minimum
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('should send message when no minimum quantity is configured', async () => {
        // Default mock returns null for getMinQuantityForProgram

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 15_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('should not send message when quantity per CPF is below minimum', async () => {
        // Set min quantity for SMILES to 50000 (50k miles)
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 50_000, // 50k total but 25k per CPF < 50k minimum
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 50k 2CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send message when quantity per CPF meets minimum with multiple CPFs', async () => {
        // Set min quantity for SMILES to 25000 (25k miles)
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(25_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 50_000, // 50k total, 25k per CPF = 25k minimum
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 50k 2CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });
    });

    describe('Empty price table', () => {
      it('should not send message when price table is empty for provider', async () => {
        // Override mock to return empty price table for SMILES
        mockPriceTableProvider.getPriceTableForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve({}); // Empty price table
          }
          return Promise.resolve(priceTables[programId] ?? null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        // No message sent because SMILES has empty price table
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not send message when program is not configured for user', async () => {
        // Remove SMILES from configured programs
        configuredProgramIds = [2, 3, 4, 5, 6]; // No SMILES (id: 1)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        // No message sent because SMILES is not configured for user
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });
  });

});
