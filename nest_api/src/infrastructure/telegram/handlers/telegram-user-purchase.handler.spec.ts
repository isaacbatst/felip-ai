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
    'SMILES Liminar': 2,
    LATAM: 3,
    'LATAM Liminar': 4,
    'AZUL/TUDO AZUL': 5,
    'AZUL Liminar': 6,
  } as const;

  // Test programs data
  const testPrograms = [
    { id: 1, name: 'SMILES', liminarOfId: null, createdAt: new Date() },
    { id: 2, name: 'SMILES Liminar', liminarOfId: 1, createdAt: new Date() },
    { id: 3, name: 'LATAM', liminarOfId: null, createdAt: new Date() },
    { id: 4, name: 'LATAM Liminar', liminarOfId: 3, createdAt: new Date() },
    { id: 5, name: 'AZUL/TUDO AZUL', liminarOfId: null, createdAt: new Date() },
    { id: 6, name: 'AZUL Liminar', liminarOfId: 5, createdAt: new Date() },
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
    describe('Normal provider with both normal and liminar available', () => {
      it('should send both prices when user has both normal and liminar with enough miles', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20 Normal\n21 Liminar');
      });

      it('should send both LATAM prices when user has both', async () => {
        // LATAM has 40k, LATAM LIMINAR has 20000 - not enough for 30k
        availableMiles[4] = 50000; // Give LATAM LIMINAR enough

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.LATAM,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'LATAM 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('19 Normal\n20 Liminar');
      });

      it('should send both AZUL prices when user has both', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 15_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['AZUL/TUDO AZUL'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'AZUL 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20 Normal\n21 Liminar');
      });
    });

    describe('Normal provider with only normal available', () => {
      it('should send only normal price when liminar has insufficient miles', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough for 30k

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20');
        expect(sentMessage).not.toContain('Liminar');
      });

      it('should send only normal price when liminar is not configured', async () => {
        configuredProgramIds = [1, 3, 4, 5, 6]; // No SMILES LIMINAR (id: 2)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20');
        expect(sentMessage).not.toContain('Liminar');
      });
    });

    describe('Normal provider with only liminar available', () => {
      it('should send only liminar price when normal has insufficient miles', async () => {
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
        expect(sentMessage).toBe('21 Liminar');
      });

      it('should send only liminar price when LATAM normal has insufficient miles', async () => {
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
        expect(sentMessage).toBe('20 Liminar');
      });
    });

    describe('Neither normal nor liminar has enough miles', () => {
      it('should not send message when neither SMILES nor SMILES LIMINAR has enough miles', async () => {
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
      it('should send only liminar price when user requests SMILES LIMINAR directly', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['SMILES Liminar'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('21 Liminar');
        // Should NOT include normal price
        expect(sentMessage).not.toContain('\n');
      });

      it('should not send message when user requests liminar directly but it has insufficient miles', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough for 30k

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['SMILES Liminar'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('User accepts specific prices with dual pricing', () => {
      it('should send "Vamos!" when accepted price >= lowest of both prices', async () => {
        // Both SMILES (20) and SMILES LIMINAR (21) available
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25], // Higher than both
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

      it('should send "Vamos!" when accepted price equals lowest price', async () => {
        // SMILES price is 20 (the lowest), SMILES LIMINAR is 21
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [20], // Equals SMILES (lowest)
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

      it('should send both prices in group and counter offer with both prices in private when within threshold', async () => {
        // SMILES (20) and SMILES LIMINAR (21) both available
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15], // Lower than both (diff from lowest: 20-15=5)
        }));

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

        // Group message should contain both prices
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20 Normal\n21 Liminar');

        // Counter offer in private should contain both prices inline
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
        const privateMessage = mockTdlibUserClient.sendMessageToUser.mock.calls[0][2];
        expect(privateMessage).toContain('20,00 (Normal) / 21,00 (Liminar)');
      });

      it('should send CTA with both prices when accepted price >= lowest and counter offer enabled', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25], // Higher than both prices
        }));

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
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId);

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          'Vamos!',
          messageId,
        );

        // CTA should use accepted price (25) as floor — both prices raised to 25
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
        const privateMessage = mockTdlibUserClient.sendMessageToUser.mock.calls[0][2];
        expect(privateMessage).toContain('25,00 (Normal) / 25,00 (Liminar)');
      });

      it('should use accepted price as floor in CTA when it is between normal and liminar prices', async () => {
        // SMILES normal = 20, SMILES LIMINAR = 21, accepted = 20.5
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [20.5], // Between normal (20) and liminar (21)
        }));

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
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 20.5', senderId);

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          'Vamos!',
          messageId,
        );

        // CTA should use accepted price (20.5) as floor for normal price (20 → 20.5), liminar stays 21
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
        const privateMessage = mockTdlibUserClient.sendMessageToUser.mock.calls[0][2];
        expect(privateMessage).toContain('20,50 (Normal) / 21,00 (Liminar)');
      });
    });

    describe('User accepts specific prices (single price scenarios)', () => {
      it('should send "Vamos!" when user accepts price higher than calculated', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25],
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
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [20],
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
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15],
        }));

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

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20');

        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledWith(
          telegramUserId,
          senderId,
          expect.any(String),
        );
      });

      it('should send calculated price in group when user accepts price lower than calculated and counter offer is disabled', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15],
        }));

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
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [10],
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 10');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const groupMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(groupMessage).toBe('20');
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledWith(
          telegramUserId,
          chatId,
          '20',
          messageId,
        );
      });

      it('should use minimum of multiple accepted prices for comparison', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25, 22, 30],
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
          airlineId: 999,
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
        availableMiles[1] = 100000;
        availableMiles[2] = 100000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 60_000,
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 60k 2CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        // Both prices shown: SMILES 30k/CPF = 20, SMILES LIMINAR 30k/CPF = 21
        expect(sentMessage).toBe('20 Normal\n21 Liminar');
      });
    });

    describe('Custom max price (PREÇO TETO)', () => {
      it('should respect custom max price when calculating', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockPriceTableProvider.getMaxPriceForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve(19);
          }
          return Promise.resolve(maxPrices[programId] ?? null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 15_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('19');
      });

      it('should ignore custom max price when it is 0 (use price table value instead)', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockPriceTableProvider.getMaxPriceForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve(0);
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
        expect(sentMessage).toBe('20');
      });
    });

    describe('Minimum quantity filter', () => {
      it('should not send message when both programs are below their min quantity', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(50_000);
          if (programId === PROGRAM_IDS['SMILES Liminar']) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send only normal price when liminar is below its min quantity', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS['SMILES Liminar']) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('20');
      });

      it('should send only liminar price when normal is below its min quantity but liminar passes', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('21 Liminar');
      });

      it('should send message when quantity meets minimum', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(30_000);
          if (programId === PROGRAM_IDS['SMILES Liminar']) return Promise.resolve(30_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('should send message when no minimum quantity is configured', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 15_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 15k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });

      it('should not send message when quantity per CPF is below minimum for both programs', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(50_000);
          if (programId === PROGRAM_IDS['SMILES Liminar']) return Promise.resolve(50_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 50_000,
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 50k 2CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send message when quantity per CPF meets minimum with multiple CPFs', async () => {
        mockPriceTableProvider.getMinQuantityForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) return Promise.resolve(25_000);
          if (programId === PROGRAM_IDS['SMILES Liminar']) return Promise.resolve(25_000);
          return Promise.resolve(null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 50_000,
          cpfCount: 2,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 50k 2CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
      });
    });

    describe('Empty price table', () => {
      it('should not send message when price table is empty for provider', async () => {
        mockPriceTableProvider.getPriceTableForProgram.mockImplementation((_userId: string, programId: number) => {
          if (programId === PROGRAM_IDS.SMILES) {
            return Promise.resolve({});
          }
          if (programId === PROGRAM_IDS['SMILES Liminar']) {
            return Promise.resolve({});
          }
          return Promise.resolve(priceTables[programId] ?? null);
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should send liminar price when normal program is not configured but liminar is', async () => {
        configuredProgramIds = [2, 3, 4, 5, 6]; // No SMILES (id: 1), but SMILES LIMINAR (id: 2) is configured

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBe('21 Liminar');
      });

      it('should not send message when neither normal nor liminar is configured', async () => {
        configuredProgramIds = [3, 4, 5, 6]; // No SMILES (id: 1) nor SMILES LIMINAR (id: 2)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });
  });

});
