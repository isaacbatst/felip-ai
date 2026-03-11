import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramPurchaseHandler } from './telegram-user-purchase.handler';
import { MessageParser } from '@/domain/interfaces/message-parser.interface';
import { PriceTableProvider } from '@/domain/interfaces/price-table-provider.interface';
import { PurchaseValidatorService } from '@/domain/services/purchase-validator.service';
import { PriceCalculatorService } from '@/domain/services/price-calculator.service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { CounterOfferSettingsRepository } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { PrivateMessageBufferService } from '@/infrastructure/telegram/private-message-buffer.service';
import { BotPreferenceRepository } from '@/infrastructure/persistence/bot-status.repository';
import { GroupDelaySettingsRepository } from '@/infrastructure/persistence/group-delay-settings.repository';
import { BlacklistRepository } from '@/infrastructure/persistence/blacklist.repository';
import { GroupReasoningSettingsRepository } from '@/infrastructure/persistence/group-reasoning-settings.repository';
import { GroupCounterOfferSettingsRepository } from '@/infrastructure/persistence/group-counter-offer-settings.repository';
import type { PriceTableV2 } from '@/domain/types/price.types';
import type { PurchaseProposal } from '@/domain/types/purchase.types';

describe('TelegramPurchaseHandler', () => {
  let handler: TelegramPurchaseHandler;
  let mockMessageParser: jest.Mocked<MessageParser>;
  let mockPriceTableProvider: jest.Mocked<PriceTableProvider>;
  let mockTdlibUserClient: jest.Mocked<TelegramUserClientProxyService>;
  let mockCounterOfferSettingsRepository: jest.Mocked<CounterOfferSettingsRepository>;
  let mockMilesProgramRepository: jest.Mocked<MilesProgramRepository>;
  let mockGroupReasoningSettingsRepository: jest.Mocked<GroupReasoningSettingsRepository>;
  let mockGroupCounterOfferSettingsRepository: jest.Mocked<GroupCounterOfferSettingsRepository>;

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
    18: { 15: 19, 30: 17, 50: 15 }, // AZUL VIAGENS
  };

  // Fake available miles by program ID
  let availableMiles: Record<number, number | null> = {
    1: 50000, // SMILES
    2: 30000, // SMILES LIMINAR
    3: 40000, // LATAM
    4: 20000, // LATAM LIMINAR
    5: 60000, // AZUL/TUDO AZUL
    6: 25000, // AZUL LIMINAR
    18: 50000, // AZUL VIAGENS
  };

  // Fake max prices by program ID
  const maxPrices: Record<number, number | null> = {
    1: 22, // SMILES
    2: 23, // SMILES LIMINAR
    3: 21, // LATAM
    4: 22, // LATAM LIMINAR
    5: 20, // AZUL/TUDO AZUL
    6: 21, // AZUL LIMINAR
    18: 19, // AZUL VIAGENS
  };

  // Default configured program IDs
  let configuredProgramIds = [1, 2, 3, 4, 5, 6, 18];

  // Mapping of program names to IDs for tests
  const PROGRAM_IDS = {
    SMILES: 1,
    'SMILES Liminar': 2,
    LATAM: 3,
    'LATAM Liminar': 4,
    'AZUL/TUDO AZUL': 5,
    'AZUL Liminar': 6,
    'AZUL VIAGENS': 18,
  } as const;

  // Test programs data
  const testPrograms = [
    { id: 1, name: 'SMILES', liminarOfId: null, absurdPriceMin: 10, absurdPriceMax: 25, noCpfAllowed: false, createdAt: new Date() },
    { id: 2, name: 'SMILES Liminar', liminarOfId: 1, absurdPriceMin: null, absurdPriceMax: null, noCpfAllowed: false, createdAt: new Date() },
    { id: 3, name: 'LATAM', liminarOfId: null, absurdPriceMin: 12, absurdPriceMax: 25, noCpfAllowed: false, createdAt: new Date() },
    { id: 4, name: 'LATAM Liminar', liminarOfId: 3, absurdPriceMin: null, absurdPriceMax: null, noCpfAllowed: false, createdAt: new Date() },
    { id: 5, name: 'AZUL/TUDO AZUL', liminarOfId: null, absurdPriceMin: 9, absurdPriceMax: 25, noCpfAllowed: false, createdAt: new Date() },
    { id: 6, name: 'AZUL Liminar', liminarOfId: 5, absurdPriceMin: null, absurdPriceMax: null, noCpfAllowed: false, createdAt: new Date() },
    { id: 18, name: 'AZUL VIAGENS', liminarOfId: null, absurdPriceMin: 9, absurdPriceMax: 25, noCpfAllowed: true, createdAt: new Date() },
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
      18: 50000, // AZUL VIAGENS
    };
    configuredProgramIds = [1, 2, 3, 4, 5, 6, 18];

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
      getCounterOfferThresholdForProgram: jest.fn().mockResolvedValue(null),
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
      seedDefaultPrograms: jest.fn(),
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
        PrivateMessageBufferService,
        {
          provide: BotPreferenceRepository,
          useValue: {
            getBotStatus: jest.fn().mockResolvedValue(true),
            setBotStatus: jest.fn(),
            getDelayDefaults: jest.fn().mockResolvedValue({ delayMin: 0, delayMax: 0 }),
            setDelayDefaults: jest.fn(),
          },
        },
        {
          provide: GroupDelaySettingsRepository,
          useValue: {
            getGroupDelaySetting: jest.fn().mockResolvedValue(null),
            getAllGroupDelaySettings: jest.fn().mockResolvedValue([]),
            upsertGroupDelaySetting: jest.fn(),
          },
        },
        {
          provide: BlacklistRepository,
          useValue: {
            isBlocked: jest.fn().mockResolvedValue(false),
            getBlacklist: jest.fn().mockResolvedValue([]),
            add: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: GroupReasoningSettingsRepository,
          useValue: {
            getGroupReasoningSetting: jest.fn().mockResolvedValue(null),
            getAllGroupReasoningSettings: jest.fn().mockResolvedValue([]),
            upsertGroupReasoningSetting: jest.fn(),
          },
        },
        {
          provide: GroupCounterOfferSettingsRepository,
          useValue: {
            getGroupSetting: jest.fn().mockResolvedValue(null),
            getAllGroupSettings: jest.fn().mockResolvedValue([]),
            upsertGroupSetting: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<TelegramPurchaseHandler>(TelegramPurchaseHandler);
    mockGroupReasoningSettingsRepository = module.get(GroupReasoningSettingsRepository);
    mockGroupCounterOfferSettingsRepository = module.get(GroupCounterOfferSettingsRepository);
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
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 1,
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
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 1,
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
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 1,
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
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 1,
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
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 1,
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

      it('should skip when multiple accepted prices are present (bot trap detection)', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25, 22, 30],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 22');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('Absurd price filter', () => {
      it('should skip when accepted price is below program absurd price min', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [5], // Below SMILES min (10)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 5');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should skip when accepted price is above program absurd price max', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [30], // Above SMILES max (25)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 30');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should process when accepted price is within program absurd price range', async () => {
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough (single price scenario)

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [15], // Within SMILES range (10-19)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 15');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should process when accepted price equals absurd price min', async () => {
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [10], // Equals SMILES min (10)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 10');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should process when accepted price equals absurd price max', async () => {
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25], // Equals SMILES max (25)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should not filter when program has no absurd price range configured', async () => {
        // SMILES Liminar has null absurdPriceMin/Max
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS['SMILES Liminar'],
          acceptedPrices: [999], // Any price should pass
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES LIMINAR 30k 1CPF aceito 999');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should not filter when no accepted prices are present', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should filter by min only when only absurdPriceMin is configured', async () => {
        mockMilesProgramRepository.getAllPrograms.mockResolvedValueOnce([
          { ...testPrograms[0], absurdPriceMin: 10, absurdPriceMax: null },
          ...testPrograms.slice(1),
        ]);
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [5], // Below min, max is null
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 5');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not filter above when only absurdPriceMin is configured', async () => {
        mockMilesProgramRepository.getAllPrograms.mockResolvedValueOnce([
          { ...testPrograms[0], absurdPriceMin: 10, absurdPriceMax: null },
          ...testPrograms.slice(1),
        ]);
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [999], // Way above, but no max configured
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 999');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should filter by max only when only absurdPriceMax is configured', async () => {
        mockMilesProgramRepository.getAllPrograms.mockResolvedValueOnce([
          { ...testPrograms[0], absurdPriceMin: null, absurdPriceMax: 25 },
          ...testPrograms.slice(1),
        ]);
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [30], // Above max, min is null
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 30');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should not filter below when only absurdPriceMax is configured', async () => {
        mockMilesProgramRepository.getAllPrograms.mockResolvedValueOnce([
          { ...testPrograms[0], absurdPriceMin: null, absurdPriceMax: 25 },
          ...testPrograms.slice(1),
        ]);
        availableMiles[2] = 10000;

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [1], // Way below, but no min configured
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 1');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalled();
      });

      it('should filter based on the identified program range (LATAM)', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.LATAM,
          acceptedPrices: [5], // Below LATAM min (12)
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'LATAM 30k 1CPF aceito 5');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
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

    describe('Reply message filter', () => {
      it('should skip message when isReply is true', async () => {
        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          'SMILES 30k 1CPF',
          undefined,
          true,
        );

        expect(mockMessageParser.parse).not.toHaveBeenCalled();
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should process message when isReply is false', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          'SMILES 30k 1CPF',
          undefined,
          false,
        );

        expect(mockMessageParser.parse).toHaveBeenCalled();
      });

      it('should process message when isReply is omitted (defaults to false)', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          'SMILES 30k 1CPF',
        );

        expect(mockMessageParser.parse).toHaveBeenCalled();
      });
    });

    describe('Max message length filter', () => {
      it('should skip message with 151+ chars', async () => {
        // 151 chars: exceeds the 150-char limit
        const longMessage = 'SMILES 30k 1CPF ' + 'a'.repeat(151 - 'SMILES 30k 1CPF '.length);
        expect(longMessage.length).toBe(151);

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          longMessage,
        );

        expect(mockMessageParser.parse).not.toHaveBeenCalled();
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should accept message with exactly 150 chars', async () => {
        const message = 'SMILES 30k 1CPF ' + 'a'.repeat(150 - 'SMILES 30k 1CPF '.length);
        expect(message.length).toBe(150);

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          message,
        );

        expect(mockMessageParser.parse).toHaveBeenCalled();
      });

      it('should accept short telegraphic message (not affected by max length)', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          'SMILES 30k 1CPF',
        );

        expect(mockMessageParser.parse).toHaveBeenCalled();
      });
    });

    describe('Trap word filter', () => {
      it.each([
        ['bot', 'SMILES 30k 1CPF bot'],
        ['BOT (uppercase)', 'SMILES 30k 1CPF BOT'],
        ['Bot (mixed case)', 'Pegadinha pro Bot SMILES 30k'],
        ['robot', 'SMILES 30k 1CPF robot'],
        ['robô (accented)', 'SMILES 30k 1CPF robô'],
        ['robo', 'SMILES 30k 1CPF robo'],
        ['pegadinha', 'Latam 180k 1cpf 20 Pegadinha pro bot'],
        ['teste', 'SMILES 30k 1CPF teste'],
        ['armadilha', 'SMILES 30k 1CPF armadilha'],
        ['transferência', 'SMILES 30k 1CPF transferência'],
        ['tenho', 'tenho SMILES 30k 1CPF'],
        ['faço', 'faço SMILES 30k 1CPF'],
        ['vendo', 'vendo SMILES 30k 1CPF'],
        ['teto smiles', 'teto smiles 30k 1CPF 20'],
        ['interessar', 'SMILES 30k 1CPF interessar'],
        ['interesse', 'SMILES 30k 1CPF interesse'],
        ['banimento', 'SMILES 30k 1CPF banimento'],
        ['ia', 'SMILES 30k 1CPF ia'],
        ['brincadeira', 'SMILES 30k 1CPF brincadeira'],
        ['joke', 'SMILES 30k 1CPF joke'],
        ['malandragem', 'SMILES 30k 1CPF malandragem'],
        ['compramos', 'compramos SMILES 30k 1CPF'],
        ['negociar', 'SMILES 30k 1CPF negociar'],
        ['chama', 'chama SMILES 30k 1CPF'],
        ['informações', 'SMILES 30k 1CPF informações'],
        ['pv', 'SMILES 30k 1CPF pv'],
        ['privado', 'SMILES 30k 1CPF privado'],
        ['conta cheia', 'SMILES 30k conta cheia'],
        ['contas cheias', 'SMILES 30k contas cheias'],
        ['conta fechada', 'SMILES 30k conta fechada'],
        ['contas fechadas', 'SMILES 30k contas fechadas'],
        ['na conversa', '16 foi a quantidade informada na conversa SMILES 100k'],
        ['internamente', 'Confirmando internamente SMILES 100k 16 CPF Compro'],
        ['estruturada em', 'A negociação está estruturada em 100k SMILES'],
        ['estruturado em', 'O acordo está estruturado em 100k SMILES 16 CPF'],
        ['em relação', 'Em relação à SMILES recebi proposta de 100k 16 CPF Compro'],
        ['voltando ao assunto', 'Voltando ao assunto SMILES 100k 16 CPF Compro'],
        ['disse que', 'O contato disse que consegue 100k SMILES 16 CPF'],
        ['afirmou que', 'O anunciante afirmou que atende 16 CPFs SMILES 100k'],
        ['informou que', 'O vendedor informou que tem 100k SMILES 16 CPF'],
        ['se confirmar', 'Se confirmar disponibilidade SMILES 100k 16 CPF Compro'],
        ['se estiver', 'Se estiver alinhado SMILES 100k 16 CPF Compro'],
        // Plurals (s? suffix on single-word trap entries)
        ['bots (plural)', 'compra de bots SMILES 30k'],
        ['robos (plural)', 'SMILES 30k 1CPF robos'],
        ['testes (plural)', 'SMILES 30k 1CPF testes'],
        ['armadilhas (plural)', 'SMILES 30k armadilhas'],
        ['pegadinhas (plural)', 'SMILES 30k pegadinhas'],
        ['brincadeiras (plural)', 'SMILES 30k brincadeiras'],
        ['jokes (plural)', 'SMILES 30k 1CPF jokes'],
        ['banimentos (plural)', 'SMILES 30k banimentos'],
        ['interesses (plural)', 'SMILES 30k interesses'],
      ])('should skip message containing "%s"', async (_label, text) => {
        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          text,
        );

        expect(mockMessageParser.parse).not.toHaveBeenCalled();
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it.each([
        ['normal purchase message', 'SMILES 30k 1CPF'],
        ['purchase with price', 'SMILES 30k 1CPF 15,50'],
        ['Botafogo (contains "bot" as substring)', 'SMILES 30k 1CPF Botafogo'],
        ['robotics (contains "robot" as substring)', 'SMILES 30k 1CPF robotics'],
      ])('should NOT skip message with "%s"', async (_label, text) => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(
          loggedInUserId,
          telegramUserId,
          chatId,
          messageId,
          text,
        );

        expect(mockMessageParser.parse).toHaveBeenCalled();
      });
    });

    describe('Group message dedup', () => {
      it('should skip when group dedup is enabled and same sender+request seen recently', async () => {
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        const senderId = 999;

        // First call: should process normally
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', senderId);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);

        jest.clearAllMocks();
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Second call: same sender, same request — should be skipped
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', senderId);
        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

      it('should NOT skip when group dedup is disabled', async () => {
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());
        const senderId = 999;

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', senderId);
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', senderId);

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(2);
      });

      it('should NOT skip when different sender makes same request', async () => {
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray());

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', 999);
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', 888);

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(2);
      });

      it('should NOT skip when same sender makes different request', async () => {
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: true,
          groupDedupWindowMinutes: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const senderId = 999;

        // First call: SMILES 30k
        mockMessageParser.parse.mockResolvedValueOnce(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF', senderId);

        // Second call: LATAM 30k (different program)
        mockMessageParser.parse.mockResolvedValueOnce(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.LATAM,
        }));
        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'LATAM 30k 1CPF', senderId);

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(2);
      });
    });

    describe('cpfCount=0 handling', () => {
      it('should process with cpfCount=1 when cpfCount=0 and program has noCpfAllowed=true', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 0,
          airlineId: PROGRAM_IDS['AZUL VIAGENS'],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'Azul Viagens 30k sem CPF');

        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        // Price should be calculated with cpfCount=1 (overridden from 0)
        const sentMessage = mockTdlibUserClient.sendMessage.mock.calls[0][2];
        expect(sentMessage).toBeDefined();
      });

      it('should reject (no response) when cpfCount=0 and program has noCpfAllowed=false', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 0,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k sem CPF');

        expect(mockTdlibUserClient.sendMessage).not.toHaveBeenCalled();
      });

    });

    describe('Reasoning effort per group', () => {
      it('should pass reasoning effort "minimal" when no reasoning setting exists', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockMessageParser.parse).toHaveBeenCalledWith(
          'SMILES 30k 1CPF',
          expect.any(Array),
          'minimal',
        );
      });

      it('should pass reasoning effort "minimal" when reasoning mode is "fast"', async () => {
        mockGroupReasoningSettingsRepository.getGroupReasoningSetting.mockResolvedValue({
          userId: loggedInUserId,
          groupId: chatId,
          reasoningMode: 'fast',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockMessageParser.parse).toHaveBeenCalledWith(
          'SMILES 30k 1CPF',
          expect.any(Array),
          'minimal',
        );
      });

      it('should pass reasoning effort "high" when reasoning mode is "precise"', async () => {
        mockGroupReasoningSettingsRepository.getGroupReasoningSetting.mockResolvedValue({
          userId: loggedInUserId,
          groupId: chatId,
          reasoningMode: 'precise',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF');

        expect(mockMessageParser.parse).toHaveBeenCalledWith(
          'SMILES 30k 1CPF',
          expect.any(Array),
          'high',
        );
      });
    });

    describe('Per-group counter offer override', () => {
      const senderId = 999;

      it('should use per-group isEnabled=false to skip counter offer even when global is enabled', async () => {
        // Global: enabled with threshold
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 2,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Per-group: disabled
        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValue({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: false,
          privateDelayMin: null,
          privateDelayMax: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Buyer offers 19, our price is 20 (diff=1, within threshold=2)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [19],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF R$19', senderId);

        // Should send group message but NOT a private counter offer
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();
      });

      it('should use per-group isEnabled=true to send counter offer even when global is disabled', async () => {
        // Global: disabled
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: false,
          priceThreshold: 2,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Per-group: enabled
        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValue({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: null,
          privateDelayMax: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Buyer offers 19, our price is 20 (diff=1, within threshold=2)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [19],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF R$19', senderId);

        // Should send group message AND a private counter offer
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should use per-program priceThreshold override', async () => {
        // Global: enabled, threshold=0.5 (tight)
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Per-program threshold=3 (wide) for SMILES
        mockPriceTableProvider.getCounterOfferThresholdForProgram.mockResolvedValue(3);

        // Buyer offers 18, our price is 20 (diff=2, within per-program threshold=3 but NOT within global threshold=0.5)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [18],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF R$18', senderId);

        // Should send private counter offer because per-program threshold is wider
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should fall back to global threshold when no per-program threshold exists', async () => {
        // Global: enabled, threshold=2
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 2,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // No per-program threshold (null — the default mock)
        mockPriceTableProvider.getCounterOfferThresholdForProgram.mockResolvedValue(null);

        // Buyer offers 19, our price is 20 (diff=1, within global threshold=2)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [19],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF R$19', senderId);

        // Should use global threshold and send counter offer
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should fall back to global settings when no per-group override exists', async () => {
        // Global: enabled, threshold=2
        mockCounterOfferSettingsRepository.getSettings.mockResolvedValue({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 2,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // No per-group override (returns null — the default mock)
        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValue(null);

        // Buyer offers 19, our price is 20 (diff=1, within global threshold=2)
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [19],
        }));

        await handler.handlePurchase(loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF R$19', senderId);

        // Should use global settings and send counter offer
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });
    });

    describe('Private message delay', () => {
      const senderId = 999;

      beforeEach(() => {
        jest.useFakeTimers();
        // Single price scenario for simplicity
        availableMiles[2] = 10000; // SMILES LIMINAR - not enough
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should apply private delay before sending counter offer when group has delay configured', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [19], // Within threshold (diff = 1)
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValueOnce({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: 3,
          privateDelayMax: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const handlePromise = handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 19', senderId,
        );

        // Group message sent immediately (no group delay configured)
        await jest.advanceTimersByTimeAsync(0);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);

        // Private message NOT sent yet (waiting for private delay)
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();

        // Advance past max delay
        await jest.advanceTimersByTimeAsync(5000);

        await handlePromise;

        // Now private message should have been sent
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should apply private delay before sending CTA when group has delay configured', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25], // Higher than calculated price
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValueOnce({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: 2,
          privateDelayMax: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const handlePromise = handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId,
        );

        // Group message sent immediately
        await jest.advanceTimersByTimeAsync(0);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);

        // Private message NOT sent yet
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();

        // Advance past max delay
        await jest.advanceTimersByTimeAsync(4000);

        await handlePromise;

        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should not apply private delay when group has no override', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25],
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // No group override (returns null — default mock)

        await handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId,
        );

        // Both group and private messages sent without waiting
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should apply fixed delay when only privateDelayMin is provided', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25],
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValueOnce({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: 5,
          privateDelayMax: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const handlePromise = handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId,
        );

        await jest.advanceTimersByTimeAsync(0);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(5000);
        await handlePromise;

        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should apply fixed delay when only privateDelayMax is provided', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25],
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValueOnce({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: null,
          privateDelayMax: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const handlePromise = handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId,
        );

        await jest.advanceTimersByTimeAsync(0);
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(3000);
        await handlePromise;

        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });

      it('should not apply private delay when group delay values are null', async () => {
        mockMessageParser.parse.mockResolvedValue(createPurchaseProposalArray({
          quantity: 30_000,
          cpfCount: 1,
          airlineId: PROGRAM_IDS.SMILES,
          acceptedPrices: [25],
        }));

        mockCounterOfferSettingsRepository.getSettings.mockResolvedValueOnce({
          userId: loggedInUserId,
          isEnabled: true,
          priceThreshold: 5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
          dedupEnabled: false,
          dedupWindowMinutes: 1,
          groupDedupEnabled: false,
          groupDedupWindowMinutes: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Group has counter-offer enabled but no private delay configured
        mockGroupCounterOfferSettingsRepository.getGroupSetting.mockResolvedValueOnce({
          userId: loggedInUserId,
          groupId: chatId,
          isEnabled: true,
          privateDelayMin: null,
          privateDelayMax: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await handler.handlePurchase(
          loggedInUserId, telegramUserId, chatId, messageId, 'SMILES 30k 1CPF aceito 25', senderId,
        );

        // Both messages sent without delay
        expect(mockTdlibUserClient.sendMessage).toHaveBeenCalledTimes(1);
        expect(mockTdlibUserClient.sendMessageToUser).toHaveBeenCalledTimes(1);
      });
    });
  });

});
