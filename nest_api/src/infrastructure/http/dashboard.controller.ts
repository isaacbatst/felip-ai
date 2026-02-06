import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Res,
  Req,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { UserDataRepository, PriceEntryInput, MaxPriceInput, AvailableMilesInput } from '@/infrastructure/persistence/user-data.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { CounterOfferSettingsRepository, type CounterOfferSettingsInput } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { BotStatusRepository } from '@/infrastructure/persistence/bot-status.repository';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { SubscriptionService } from '@/infrastructure/subscription/subscription.service';
import { HybridAuthorizationService } from '@/infrastructure/subscription/hybrid-authorization.service';
import { SessionGuard } from '@/infrastructure/http/guards/session.guard';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { UserRepository } from '@/infrastructure/persistence/user.repository';
import { randomUUID } from 'node:crypto';
import {
  COUNTER_OFFER_TEMPLATES,
  COUNTER_OFFER_TEMPLATE_DESCRIPTIONS,
  COUNTER_OFFER_TEMPLATE_IDS,
  CALL_TO_ACTION_TEMPLATES,
  CALL_TO_ACTION_TEMPLATE_DESCRIPTIONS,
  CALL_TO_ACTION_TEMPLATE_IDS,
} from '@/domain/constants/counter-offer-templates';

// ============================================================================
// DTOs for request/response
// ============================================================================

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

interface ProgramResponse {
  id: number;
  name: string;
  isLiminar: boolean;
  liminarOfId: number | null;
}

interface UserDataResponse {
  priceEntries: Array<{
    id: number;
    programId: number;
    programName: string;
    quantity: number;
    price: number;
  }>;
  maxPrices: Array<{
    programId: number;
    programName: string;
    maxPrice: number;
  }>;
  availableMiles: Array<{
    programId: number;
    programName: string;
    availableMiles: number;
  }>;
}

interface UpdatePricesDto {
  entries: PriceEntryInput[];
}

interface UpdateMaxPricesDto {
  maxPrices: MaxPriceInput[];
}

interface UpdateMilesDto {
  miles: AvailableMilesInput[];
}

interface UpdateSinglePriceDto {
  id?: number;
  programId: number;
  quantity: number;
  price: number;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CounterOfferSettingsResponse {
  isEnabled: boolean;
  priceThreshold: number;
  messageTemplateId: number;
  callToActionTemplateId: number;
}

interface CounterOfferTemplatesResponse {
  templates: Array<{
    id: number;
    description: string;
    preview: string;
  }>;
}

interface CallToActionTemplatesResponse {
  templates: Array<{
    id: number;
    description: string;
    preview: string;
  }>;
}

interface UpdateCounterOfferSettingsDto {
  isEnabled: boolean;
  priceThreshold: number;
  messageTemplateId: number;
  callToActionTemplateId: number;
}

interface GroupResponse {
  id: number;
  title: string;
  isActive: boolean;
}

interface ActiveGroupsResponse {
  groups: GroupResponse[];
}

interface AvailableGroupsResponse {
  groups: GroupResponse[];
}

interface BotStatusResponse {
  isEnabled: boolean;
}

interface UpdateBotStatusDto {
  isEnabled: boolean;
}

interface WorkerStatusResponse {
  workerRunning: boolean;
  authState: 'idle' | 'waitingCode' | 'waitingPassword' | 'completed' | 'failed' | null;
  workerStarting: boolean;
  lastAuthError: string | null;
}

interface SubmitAuthCodeDto {
  code: string;
}

interface SubmitPasswordDto {
  password: string;
}

interface SubscriptionStatusResponse {
  subscription: {
    id: number;
    status: string;
    startDate: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextBillingDate: string | null;
    trialUsed: boolean;
    extraGroups: number;
    plan: {
      id: number;
      name: string;
      displayName: string;
      priceInCents: number;
      groupLimit: number;
    };
    totalGroupLimit: number;
    activeGroupsCount: number;
    daysRemaining: number;
  } | null;
  subscriptionPageUrl: string | null;
  trialUsed: boolean;
}

/**
 * HTTP Controller for web-based dashboard
 * Uses cookie-based session auth via SessionGuard
 */
@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly userDataRepository: UserDataRepository,
    private readonly milesProgramRepository: MilesProgramRepository,
    private readonly counterOfferSettingsRepository: CounterOfferSettingsRepository,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
    private readonly botStatusRepository: BotStatusRepository,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly subscriptionService: SubscriptionService,
    private readonly hybridAuthorizationService: HybridAuthorizationService,
    private readonly workerManager: WorkerManager,
    private readonly conversationRepository: ConversationRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * GET /dashboard - Serve the dashboard HTML page
   * Redirects unauthorized users to /subscription
   */
  @Get()
  async getDashboardPage(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);
    const user = await this.userRepository.findByTelegramUserId(telegramUserId);
    const phone = user?.phone;

    const authorized = await this.hybridAuthorizationService.isAuthorized(userId, phone);
    if (!authorized) {
      res.redirect(302, '/subscription');
      return;
    }

    res.sendFile(join(__dirname, '..', '..', 'public', 'dashboard.html'));
  }

  /**
   * GET /dashboard/programs - List all available programs
   */
  @Get('programs')
  async getPrograms(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<ProgramResponse[]>> {
    const programs = await this.milesProgramRepository.getAllPrograms();

    return {
      success: true,
      data: programs.map((p) => ({
        id: p.id,
        name: p.name,
        isLiminar: p.liminarOfId !== null,
        liminarOfId: p.liminarOfId,
      })),
    };
  }

  /**
   * GET /dashboard/data - Get user's price tables, max prices, and available miles
   */
  @Get('data')
  async getUserData(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<UserDataResponse>> {
    const userId = req.user.userId;

    const programs = await this.milesProgramRepository.getAllPrograms();
    const programMap = new Map(programs.map((p) => [p.id, p.name]));

    const priceEntries = await this.userDataRepository.getPriceEntries(userId);
    const maxPrices = await this.userDataRepository.getMaxPrices(userId);
    const availableMiles = await this.userDataRepository.getAvailableMiles(userId);

    return {
      success: true,
      data: {
        priceEntries: priceEntries.map((e) => ({
          id: e.id,
          programId: e.programId,
          programName: programMap.get(e.programId) ?? 'Unknown',
          quantity: e.quantity,
          price: e.price,
        })),
        maxPrices: maxPrices.map((mp) => ({
          programId: mp.programId,
          programName: programMap.get(mp.programId) ?? 'Unknown',
          maxPrice: mp.maxPrice,
        })),
        availableMiles: availableMiles.map((am) => ({
          programId: am.programId,
          programName: programMap.get(am.programId) ?? 'Unknown',
          availableMiles: am.availableMiles,
        })),
      },
    };
  }

  /**
   * PUT /dashboard/prices - Update user's price entries
   */
  @Put('prices')
  async updatePrices(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdatePricesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    if (!body.entries || !Array.isArray(body.entries)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'entries must be an array',
      } satisfies ApiResponse);
      return;
    }

    // Validate entries
    for (const entry of body.entries) {
      if (typeof entry.programId !== 'number' || typeof entry.quantity !== 'number' || typeof entry.price !== 'number') {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Invalid entry format. Each entry must have programId, quantity, and price as numbers.',
        } satisfies ApiResponse);
        return;
      }
    }

    await this.userDataRepository.setPriceEntries(userId, body.entries);

    this.logger.log(`Updated ${body.entries.length} price entries for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  /**
   * PUT /dashboard/prices/:programId - Update price entries for a specific program
   * Replaces all price entries for the given program only
   */
  @Put('prices/:programId')
  async updatePricesForProgram(
    @Req() req: AuthenticatedRequest,
    @Param('programId') programId: string,
    @Body() body: { entries: Array<{ quantity: number; price: number }> },
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const programIdNum = parseInt(programId, 10);
    if (Number.isNaN(programIdNum)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid programId',
      } satisfies ApiResponse);
      return;
    }

    if (!body.entries || !Array.isArray(body.entries)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'entries must be an array',
      } satisfies ApiResponse);
      return;
    }

    // Validate entries
    for (const entry of body.entries) {
      if (typeof entry.quantity !== 'number' || typeof entry.price !== 'number') {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Invalid entry format. Each entry must have quantity and price as numbers.',
        } satisfies ApiResponse);
        return;
      }
    }

    await this.userDataRepository.setPriceEntriesForProgram(
      userId,
      programIdNum,
      body.entries.map((e) => ({ programId: programIdNum, ...e })),
    );

    this.logger.log(`Updated ${body.entries.length} prices for program ${programIdNum}, user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  /**
   * PUT /dashboard/price - Update a single price entry
   * If id is provided, updates the existing entry by id
   * If id is not provided, creates or updates by (userId, programId, quantity)
   */
  @Put('price')
  async updateSinglePrice(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateSinglePriceDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    if (typeof body.programId !== 'number' || typeof body.quantity !== 'number' || typeof body.price !== 'number') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid entry format. Must have programId, quantity, and price as numbers.',
      } satisfies ApiResponse);
      return;
    }

    // If id is provided, update by id (allows changing quantity)
    if (typeof body.id === 'number') {
      const updated = await this.userDataRepository.updatePriceEntryById(body.id, {
        quantity: body.quantity,
        price: body.price,
      });

      if (!updated) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          error: 'Price entry not found.',
        } satisfies ApiResponse);
        return;
      }

      this.logger.log(`Updated price entry by id=${body.id} for user ${userId}: qty=${body.quantity}, price=${body.price}`);
    } else {
      // No id provided, use upsert by (userId, programId, quantity)
      await this.userDataRepository.upsertPriceEntry(userId, body);
      this.logger.log(`Upserted price entry for user ${userId}: program=${body.programId}, qty=${body.quantity}`);
    }

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  /**
   * DELETE /dashboard/price/:id - Delete a single price entry by ID
   */
  @Delete('price/:id')
  async deleteSinglePrice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const entryId = parseInt(id, 10);
    if (Number.isNaN(entryId)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Invalid id format. Must be a number.',
      } satisfies ApiResponse);
      return;
    }

    await this.userDataRepository.deletePriceEntryById(entryId);

    this.logger.log(`Deleted price entry id=${entryId} for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  /**
   * PUT /dashboard/max-prices - Update user's max prices
   */
  @Put('max-prices')
  async updateMaxPrices(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateMaxPricesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    if (!body.maxPrices || !Array.isArray(body.maxPrices)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'maxPrices must be an array',
      } satisfies ApiResponse);
      return;
    }

    // Validate entries
    for (const mp of body.maxPrices) {
      if (typeof mp.programId !== 'number' || typeof mp.maxPrice !== 'number') {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Invalid max price format. Each entry must have programId and maxPrice as numbers.',
        } satisfies ApiResponse);
        return;
      }
    }

    await this.userDataRepository.setMaxPrices(userId, body.maxPrices);

    this.logger.log(`Updated ${body.maxPrices.length} max prices for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  /**
   * PUT /dashboard/miles - Update user's available miles
   */
  @Put('miles')
  async updateMiles(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateMilesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    if (!body.miles || !Array.isArray(body.miles)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'miles must be an array',
      } satisfies ApiResponse);
      return;
    }

    // Validate entries
    for (const m of body.miles) {
      if (typeof m.programId !== 'number' || typeof m.availableMiles !== 'number') {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Invalid miles format. Each entry must have programId and availableMiles as numbers.',
        } satisfies ApiResponse);
        return;
      }
    }

    await this.userDataRepository.setAvailableMiles(userId, body.miles);

    this.logger.log(`Updated ${body.miles.length} available miles for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  // ============================================================================
  // Counter Offer Settings
  // ============================================================================

  /**
   * GET /dashboard/counter-offer/templates - Get available counter offer message templates
   */
  @Get('counter-offer/templates')
  async getCounterOfferTemplates(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<CounterOfferTemplatesResponse>> {
    const templates = COUNTER_OFFER_TEMPLATE_IDS.map((id) => ({
      id,
      description: COUNTER_OFFER_TEMPLATE_DESCRIPTIONS[id],
      preview: COUNTER_OFFER_TEMPLATES[id],
    }));

    return {
      success: true,
      data: { templates },
    };
  }

  /**
   * GET /dashboard/call-to-action/templates - Get available call to action message templates
   */
  @Get('call-to-action/templates')
  async getCallToActionTemplates(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<CallToActionTemplatesResponse>> {
    const templates = CALL_TO_ACTION_TEMPLATE_IDS.map((id) => ({
      id,
      description: CALL_TO_ACTION_TEMPLATE_DESCRIPTIONS[id],
      preview: CALL_TO_ACTION_TEMPLATES[id],
    }));

    return {
      success: true,
      data: { templates },
    };
  }

  /**
   * GET /dashboard/counter-offer - Get counter offer settings
   */
  @Get('counter-offer')
  async getCounterOfferSettings(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<CounterOfferSettingsResponse>> {
    const userId = req.user.userId;

    const settings = await this.counterOfferSettingsRepository.getSettings(userId);

    // Return default values if no settings exist
    const response: CounterOfferSettingsResponse = settings
      ? {
          isEnabled: settings.isEnabled,
          priceThreshold: settings.priceThreshold,
          messageTemplateId: settings.messageTemplateId,
          callToActionTemplateId: settings.callToActionTemplateId,
        }
      : {
          isEnabled: false,
          priceThreshold: 0.5,
          messageTemplateId: 1,
          callToActionTemplateId: 1,
        };

    return {
      success: true,
      data: response,
    };
  }

  /**
   * PUT /dashboard/counter-offer - Update counter offer settings
   */
  @Put('counter-offer')
  async updateCounterOfferSettings(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateCounterOfferSettingsDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    // Validate required fields
    if (typeof body.isEnabled !== 'boolean') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'isEnabled must be a boolean',
      } satisfies ApiResponse);
      return;
    }

    if (typeof body.priceThreshold !== 'number' || body.priceThreshold < 0) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'priceThreshold must be a non-negative number',
      } satisfies ApiResponse);
      return;
    }

    if (typeof body.messageTemplateId !== 'number' || !COUNTER_OFFER_TEMPLATE_IDS.includes(body.messageTemplateId as 1 | 2 | 3)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `messageTemplateId must be one of: ${COUNTER_OFFER_TEMPLATE_IDS.join(', ')}`,
      } satisfies ApiResponse);
      return;
    }

    if (typeof body.callToActionTemplateId !== 'number' || !CALL_TO_ACTION_TEMPLATE_IDS.includes(body.callToActionTemplateId as 1 | 2)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `callToActionTemplateId must be one of: ${CALL_TO_ACTION_TEMPLATE_IDS.join(', ')}`,
      } satisfies ApiResponse);
      return;
    }

    const settings: CounterOfferSettingsInput = {
      isEnabled: body.isEnabled,
      priceThreshold: body.priceThreshold,
      messageTemplateId: body.messageTemplateId,
      callToActionTemplateId: body.callToActionTemplateId,
    };

    await this.counterOfferSettingsRepository.upsertSettings(userId, settings);

    this.logger.log(`Updated counter offer settings for user ${userId}: enabled=${body.isEnabled}, threshold=${body.priceThreshold}, counterOfferTemplate=${body.messageTemplateId}, callToActionTemplate=${body.callToActionTemplateId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  // ============================================================================
  // Active Groups Management
  // ============================================================================

  /**
   * GET /dashboard/groups - Get user's active groups with titles
   */
  @Get('groups')
  async getActiveGroups(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    // Get active group IDs from repository
    const activeGroupIds = await this.activeGroupsRepository.getActiveGroups(userId);

    if (!activeGroupIds || activeGroupIds.length === 0) {
      res.status(HttpStatus.OK).json({
        success: true,
        data: { groups: [] },
      } satisfies ApiResponse<ActiveGroupsResponse>);
      return;
    }

    // Fetch group titles from Telegram in parallel for better performance
    const groupPromises = activeGroupIds.map(async (groupId) => {
      try {
        const chatResult = await this.telegramUserClient.getChat(
          telegramUserId.toString(),
          groupId,
        ) as { title?: string } | null;

        const title = chatResult?.title ?? `Grupo ${groupId}`;
        return {
          id: groupId,
          title,
          isActive: true,
        } as GroupResponse;
      } catch (error) {
        this.logger.warn(`Error fetching chat ${groupId}`, { error });
        // Include the group even if we can't fetch the title
        return {
          id: groupId,
          title: `Grupo ${groupId}`,
          isActive: true,
        } as GroupResponse;
      }
    });

    const groups = await Promise.all(groupPromises);

    res.status(HttpStatus.OK).json({
      success: true,
      data: { groups },
    } satisfies ApiResponse<ActiveGroupsResponse>);
  }

  /**
   * GET /dashboard/available-groups - Get all groups the user can activate
   * Returns all groups/supergroups from Telegram with isActive status
   * Uses single HTTP call to TDLib worker for better performance
   */
  @Get('available-groups')
  async getAvailableGroups(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    try {
      // Single HTTP call to get all groups (filtering done inside TDLib worker)
      const telegramGroups = await this.telegramUserClient.getGroups(
        telegramUserId.toString(),
        100,
      );

      // Get current active groups
      const activeGroupIds = await this.activeGroupsRepository.getActiveGroups(userId);
      const activeGroupsSet = new Set(activeGroupIds || []);

      // Map groups to include isActive status
      const groups: GroupResponse[] = telegramGroups.map((group) => ({
        id: group.id,
        title: group.title,
        isActive: activeGroupsSet.has(group.id),
      }));

      res.status(HttpStatus.OK).json({
        success: true,
        data: { groups },
      } satisfies ApiResponse<AvailableGroupsResponse>);
    } catch (error) {
      this.logger.error('Error fetching available groups', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'worker_unavailable',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /dashboard/groups/:groupId - Activate a group
   * Validates that the group exists and is a group/supergroup before activating
   */
  @Post('groups/:groupId')
  async activateGroup(
    @Req() req: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    const groupIdNum = parseInt(groupId, 10);
    if (Number.isNaN(groupIdNum)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'invalid_group_id',
      } satisfies ApiResponse);
      return;
    }

    try {
      // Validate that the group exists and is a group/supergroup
      const chatResult = await this.telegramUserClient.getChat(
        telegramUserId.toString(),
        groupIdNum,
      ) as {
        type?: { _?: string };
        title?: string;
      } | null;

      if (
        !chatResult ||
        typeof chatResult !== 'object' ||
        !chatResult.type ||
        typeof chatResult.type !== 'object' ||
        !('_' in chatResult.type)
      ) {
        res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          error: 'group_not_found',
        } satisfies ApiResponse);
        return;
      }

      const chatType = chatResult.type._;
      if (chatType !== 'chatTypeBasicGroup' && chatType !== 'chatTypeSupergroup') {
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: 'not_a_group',
        } satisfies ApiResponse);
        return;
      }

      // Add to active groups
      await this.activeGroupsRepository.addActiveGroup(userId, groupIdNum);

      const title = typeof chatResult.title === 'string' ? chatResult.title : 'Sem título';
      this.logger.log(`Activated group ${groupIdNum} (${title}) for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          id: groupIdNum,
          title,
          isActive: true,
        },
      } satisfies ApiResponse<GroupResponse>);
    } catch (error) {
      this.logger.error('Error activating group', { error, userId, groupId: groupIdNum });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'worker_unavailable',
      } satisfies ApiResponse);
    }
  }

  /**
   * DELETE /dashboard/groups/:groupId - Deactivate a group
   */
  @Delete('groups/:groupId')
  async deactivateGroup(
    @Req() req: AuthenticatedRequest,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const groupIdNum = parseInt(groupId, 10);
    if (Number.isNaN(groupIdNum)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'invalid_group_id',
      } satisfies ApiResponse);
      return;
    }

    // Remove from active groups
    await this.activeGroupsRepository.removeActiveGroup(userId, groupIdNum);

    this.logger.log(`Deactivated group ${groupIdNum} for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  // ============================================================================
  // Bot Status Management
  // ============================================================================

  /**
   * GET /dashboard/bot-status - Get bot enabled/disabled status
   */
  @Get('bot-status')
  async getBotStatus(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<BotStatusResponse>> {
    const userId = req.user.userId;
    const isEnabled = await this.botStatusRepository.getBotStatus(userId);

    return {
      success: true,
      data: { isEnabled },
    };
  }

  /**
   * PUT /dashboard/bot-status - Update bot enabled/disabled status
   * When enabling, starts the TDLib worker and initiates login if needed
   */
  @Put('bot-status')
  async updateBotStatus(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpdateBotStatusDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    if (typeof body.isEnabled !== 'boolean') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'isEnabled must be a boolean',
      } satisfies ApiResponse);
      return;
    }

    await this.botStatusRepository.setBotStatus(userId, body.isEnabled);

    if (body.isEnabled) {
      // Check if worker is already running
      const status = await this.workerManager.getStatus(userId);
      if (!status || status.state !== 'running') {
        // Get user's phone number
        const telegramUserId = parseInt(userId, 10);
        const user = await this.userRepository.findByTelegramUserId(telegramUserId);
        if (!user) {
          this.logger.error(`User not found for telegramUserId: ${telegramUserId}`);
          res.status(HttpStatus.OK).json({ success: true } satisfies ApiResponse);
          return;
        }

        // Create a session for the login flow
        const requestId = randomUUID();
        await this.conversationRepository.setConversation({
          requestId,
          loggedInUserId: telegramUserId,
          phoneNumber: user.phone,
          state: 'idle',
          source: 'web',
        });

        // Set starting flag before firing off async work
        await this.botStatusRepository.setWorkerStartingAt(userId);

        // Fire-and-forget: start worker, then login when healthy
        this.workerManager.run(userId).then(async (started) => {
          if (!started) {
            this.logger.error(`Worker failed to start for user ${userId}`);
            await this.botStatusRepository.setLastAuthError(userId, 'WORKER_STARTUP_FAILED');
            await this.botStatusRepository.clearWorkerStartingAt(userId);
            return;
          }
          await this.telegramUserClient.login(userId, user.phone, requestId);
          this.logger.log(`Worker started and login initiated for user ${userId}`);
          await this.botStatusRepository.clearWorkerStartingAt(userId);
        }).catch(async (error) => {
          this.logger.error(`Error starting worker for user ${userId}`, { error });
          await this.botStatusRepository.setLastAuthError(userId, 'WORKER_STARTUP_ERROR');
          await this.botStatusRepository.clearWorkerStartingAt(userId);
        });
      }
    } else {
      // Clear workerStartingAt when disabling
      await this.botStatusRepository.clearWorkerStartingAt(userId);
    }

    this.logger.log(`Updated bot status for user ${userId}: enabled=${body.isEnabled}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  // ============================================================================
  // Worker Management
  // ============================================================================

  /**
   * GET /dashboard/worker/status - Get worker + TDLib auth state
   */
  @Get('worker/status')
  async getWorkerStatus(
    @Req() req: AuthenticatedRequest,
  ): Promise<ApiResponse<WorkerStatusResponse>> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    const status = await this.workerManager.getStatus(userId);
    const workerRunning = status?.state === 'running';

    let authState: WorkerStatusResponse['authState'] = null;

    if (workerRunning) {
      const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(telegramUserId);
      if (session) {
        authState = session.state as WorkerStatusResponse['authState'];
      } else {
        // Session says completed or absent — verify with a real TDLib call
        try {
          const me = await this.telegramUserClient.getMe(userId);
          authState = me ? 'completed' : 'failed';
        } catch {
          authState = 'failed';
        }
      }
    }

    // Compute workerStarting from DB timestamp (auto-expires after 2 minutes)
    const workerStartingAt = await this.botStatusRepository.getWorkerStartingAt(userId);
    let workerStarting = workerStartingAt !== null
      && (Date.now() - workerStartingAt.getTime()) < 120_000;

    // If expired, clean up stale flag
    if (workerStartingAt !== null && !workerStarting) {
      await this.botStatusRepository.clearWorkerStartingAt(userId);
      workerStarting = false;
    }

    const lastAuthError = await this.botStatusRepository.getLastAuthError(userId);

    return {
      success: true,
      data: { workerRunning, authState, workerStarting, lastAuthError },
    };
  }

  /**
   * POST /dashboard/worker/auth-code - Submit TDLib auth code
   */
  @Post('worker/auth-code')
  async submitAuthCode(
    @Req() req: AuthenticatedRequest,
    @Body() body: SubmitAuthCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    if (!body.code || typeof body.code !== 'string' || body.code.length < 4 || body.code.length > 8) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'code must be a string between 4 and 8 characters',
      } satisfies ApiResponse);
      return;
    }

    const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(telegramUserId);
    if (!session) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'no_active_session',
      } satisfies ApiResponse);
      return;
    }

    if (session.state !== 'waitingCode') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'session_not_waiting_code',
      } satisfies ApiResponse);
      return;
    }

    try {
      await this.botStatusRepository.clearLastAuthError(userId);
      await this.telegramUserClient.provideAuthCode(userId, session.requestId, body.code, {
        userId: telegramUserId,
        chatId: 0, // No bot messages
        phoneNumber: session.phoneNumber ?? '',
        state: session.state,
      });

      res.status(HttpStatus.OK).json({ success: true } satisfies ApiResponse);
    } catch (error) {
      this.logger.error('Error providing auth code', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'failed_to_submit_code',
      } satisfies ApiResponse);
    }
  }

  /**
   * POST /dashboard/worker/password - Submit 2FA password
   */
  @Post('worker/password')
  async submitPassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: SubmitPasswordDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;
    const telegramUserId = parseInt(userId, 10);

    if (!body.password || typeof body.password !== 'string') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'password is required',
      } satisfies ApiResponse);
      return;
    }

    const session = await this.conversationRepository.getActiveSessionByLoggedInUserId(telegramUserId);
    if (!session) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'no_active_session',
      } satisfies ApiResponse);
      return;
    }

    if (session.state !== 'waitingPassword') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'session_not_waiting_password',
      } satisfies ApiResponse);
      return;
    }

    try {
      await this.botStatusRepository.clearLastAuthError(userId);
      await this.telegramUserClient.providePassword(userId, session.requestId, body.password, {
        userId: telegramUserId,
        chatId: 0, // No bot messages
        phoneNumber: session.phoneNumber ?? '',
        state: session.state,
      });

      res.status(HttpStatus.OK).json({ success: true } satisfies ApiResponse);
    } catch (error) {
      this.logger.error('Error providing password', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'failed_to_submit_password',
      } satisfies ApiResponse);
    }
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * GET /dashboard/subscription - Get subscription status summary
   */
  @Get('subscription')
  async getSubscriptionStatus(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    const subscription = await this.subscriptionService.getSubscription(userId);
    const hasUsedTrial = await this.subscriptionService.hasUsedTrial(userId);

    const subscriptionPageUrl = '/subscription';

    if (!subscription) {
      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: null,
          subscriptionPageUrl,
          trialUsed: hasUsedTrial,
        },
      } satisfies ApiResponse<SubscriptionStatusResponse>);
      return;
    }

    const daysRemaining = await this.subscriptionService.getDaysRemaining(userId);
    const activeGroups = await this.activeGroupsRepository.getActiveGroups(userId);
    const activeGroupsCount = activeGroups?.length ?? 0;

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          status: subscription.status,
          startDate: subscription.startDate.toISOString(),
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          nextBillingDate: subscription.nextBillingDate?.toISOString() ?? null,
          trialUsed: subscription.trialUsed,
          extraGroups: subscription.extraGroups,
          plan: {
            id: subscription.plan.id,
            name: subscription.plan.name,
            displayName: subscription.plan.displayName,
            priceInCents: subscription.plan.priceInCents,
            groupLimit: subscription.plan.groupLimit,
          },
          totalGroupLimit: subscription.plan.groupLimit + subscription.extraGroups,
          activeGroupsCount,
          daysRemaining: daysRemaining ?? 0,
        },
        subscriptionPageUrl,
        trialUsed: subscription.trialUsed,
      },
    } satisfies ApiResponse<SubscriptionStatusResponse>);
  }

  /**
   * POST /dashboard/subscription/trial - Start a free trial
   */
  @Post('subscription/trial')
  async startTrial(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.user.userId;

    try {
      const result = await this.subscriptionService.startTrial(userId);
      const daysRemaining = await this.subscriptionService.getDaysRemaining(userId) ?? 0;

      this.logger.log(`Trial started via dashboard for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          subscription: {
            id: result.subscription.id,
            status: result.subscription.status,
            plan: {
              name: result.subscription.plan.name,
              displayName: result.subscription.plan.displayName,
            },
            currentPeriodEnd: result.subscription.currentPeriodEnd.toISOString(),
            daysRemaining,
          },
        },
      } satisfies ApiResponse);
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const subscriptionError = error as { message: string; code: string };
        res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          error: subscriptionError.message,
        } satisfies ApiResponse);
        return;
      }

      this.logger.error('Error starting trial', { error, userId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao iniciar período de teste. Tente novamente.',
      } satisfies ApiResponse);
    }
  }
}
