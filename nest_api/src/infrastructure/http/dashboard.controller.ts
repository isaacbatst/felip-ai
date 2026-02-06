import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';
import { DashboardTokenRepository } from '@/infrastructure/persistence/dashboard-token.repository';
import { UserDataRepository, PriceEntryInput, MaxPriceInput, AvailableMilesInput } from '@/infrastructure/persistence/user-data.repository';
import { MilesProgramRepository } from '@/infrastructure/persistence/miles-program.repository';
import { CounterOfferSettingsRepository, type CounterOfferSettingsInput } from '@/infrastructure/persistence/counter-offer-settings.repository';
import { ActiveGroupsRepository } from '@/infrastructure/persistence/active-groups.repository';
import { BotStatusRepository } from '@/infrastructure/persistence/bot-status.repository';
import { TelegramBotService } from '@/infrastructure/telegram/telegram-bot-service';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { AppConfigService } from '@/config/app.config';
import { SubscriptionTokenRepository } from '@/infrastructure/persistence/subscription-token.repository';
import { SubscriptionService } from '@/infrastructure/subscription/subscription.service';
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

interface TokenStatusResponse {
  valid: boolean;
  error?: string;
  expiresAt?: string;
  userId?: string;
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

interface SubscriptionLinkResponse {
  url: string;
  expiresAt: string;
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
 * Handles token validation and user data management
 */
@Controller('dashboard')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly dashboardTokenRepository: DashboardTokenRepository,
    private readonly userDataRepository: UserDataRepository,
    private readonly milesProgramRepository: MilesProgramRepository,
    private readonly counterOfferSettingsRepository: CounterOfferSettingsRepository,
    private readonly activeGroupsRepository: ActiveGroupsRepository,
    private readonly botStatusRepository: BotStatusRepository,
    private readonly telegramBotService: TelegramBotService,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly conversationRepository: ConversationRepository,
    private readonly appConfig: AppConfigService,
    private readonly subscriptionTokenRepository: SubscriptionTokenRepository,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  /**
   * GET /dashboard/:token - Serve the dashboard HTML page
   * Validates the token and serves the page if valid
   */
  @Get(':token')
  async getDashboardPage(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Dashboard page requested for token: ${token.substring(0, 8)}...`);

    const validation = await this.dashboardTokenRepository.validateToken(token);

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        not_found: 'Link inválido ou expirado.',
        expired: 'Este link expirou. Por favor, solicite um novo link no bot.',
      };

      const errorMessage = validation.error ? errorMessages[validation.error] : 'Erro desconhecido.';
      res.status(this.getHttpStatusForError(validation.error)).send(this.getErrorHtml(errorMessage));
      return;
    }

    // Serve the dashboard page
    res.sendFile(join(__dirname, '..', '..', 'public', 'dashboard.html'));
  }

  /**
   * GET /dashboard/:token/status - Check token validity
   */
  @Get(':token/status')
  async getTokenStatus(
    @Param('token') token: string,
  ): Promise<TokenStatusResponse> {
    const validation = await this.dashboardTokenRepository.validateToken(token);

    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
      };
    }

    return {
      valid: true,
      expiresAt: validation.token?.expiresAt.toISOString(),
      userId: validation.token?.userId,
    };
  }

  /**
   * GET /dashboard/:token/programs - List all available programs
   */
  @Get(':token/programs')
  async getPrograms(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const programs = await this.milesProgramRepository.getAllPrograms();
    
    const response: ApiResponse<ProgramResponse[]> = {
      success: true,
      data: programs.map((p) => ({
        id: p.id,
        name: p.name,
        isLiminar: p.liminarOfId !== null,
        liminarOfId: p.liminarOfId,
      })),
    };

    res.status(HttpStatus.OK).json(response);
  }

  /**
   * GET /dashboard/:token/data - Get user's price tables, max prices, and available miles
   */
  @Get(':token/data')
  async getUserData(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const programs = await this.milesProgramRepository.getAllPrograms();
    const programMap = new Map(programs.map((p) => [p.id, p.name]));

    const priceEntries = await this.userDataRepository.getPriceEntries(userId);
    const maxPrices = await this.userDataRepository.getMaxPrices(userId);
    const availableMiles = await this.userDataRepository.getAvailableMiles(userId);

    const response: ApiResponse<UserDataResponse> = {
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

    res.status(HttpStatus.OK).json(response);
  }

  /**
   * PUT /dashboard/:token/prices - Update user's price entries
   */
  @Put(':token/prices')
  async updatePrices(
    @Param('token') token: string,
    @Body() body: UpdatePricesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * PUT /dashboard/:token/prices/:programId - Update price entries for a specific program
   * Replaces all price entries for the given program only
   */
  @Put(':token/prices/:programId')
  async updatePricesForProgram(
    @Param('token') token: string,
    @Param('programId') programId: string,
    @Body() body: { entries: Array<{ quantity: number; price: number }> },
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * PUT /dashboard/:token/price - Update a single price entry
   * If id is provided, updates the existing entry by id
   * If id is not provided, creates or updates by (userId, programId, quantity)
   */
  @Put(':token/price')
  async updateSinglePrice(
    @Param('token') token: string,
    @Body() body: UpdateSinglePriceDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * DELETE /dashboard/:token/price/:id - Delete a single price entry by ID
   */
  @Delete(':token/price/:id')
  async deleteSinglePrice(
    @Param('token') token: string,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * PUT /dashboard/:token/max-prices - Update user's max prices
   */
  @Put(':token/max-prices')
  async updateMaxPrices(
    @Param('token') token: string,
    @Body() body: UpdateMaxPricesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * PUT /dashboard/:token/miles - Update user's available miles
   */
  @Put(':token/miles')
  async updateMiles(
    @Param('token') token: string,
    @Body() body: UpdateMilesDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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

  /**
   * POST /dashboard/:token/renew - Request a new dashboard link
   * Works even for expired tokens, sends new link via Telegram
   */
  @Post(':token/renew')
  async renewToken(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Token renewal requested for token: ${token.substring(0, 8)}...`);

    // Get the token data (even if expired) to retrieve the userId
    const tokenData = await this.dashboardTokenRepository.getToken(token);

    if (!tokenData) {
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        error: 'Token não encontrado.',
      } satisfies ApiResponse);
      return;
    }

    const userId = tokenData.userId;

    // Get the conversation to find the chatId for sending the message
    const conversation = await this.conversationRepository.getCompletedConversationByLoggedInUserId(
      parseInt(userId, 10),
    );

    if (!conversation) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'Sessão não encontrada. Faça login novamente no bot.',
      } satisfies ApiResponse);
      return;
    }

    // Generate new token
    const ttlMinutes = this.appConfig.getDashboardTokenTtlMinutes();
    const { token: newToken, expiresAt } = await this.dashboardTokenRepository.createToken(userId, ttlMinutes);

    // Build dashboard URL
    const baseUrl = this.appConfig.getAppBaseUrl();
    const dashboardUrl = `${baseUrl}/dashboard/${newToken}`;

    // Format expiration time
    const expiresInMinutes = Math.round((expiresAt.getTime() - Date.now()) / 60000);

    // Send summarized message via Telegram
    const message = 
      `🔄 *Novo Link do Dashboard*\n\n` +
      `🔗 [Abrir Dashboard](${dashboardUrl})\n\n` +
      `⏱️ Expira em ${expiresInMinutes} minutos.`;

    try {
      await this.telegramBotService.bot.api.sendMessage(conversation.chatId!, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });

      this.logger.log(`New dashboard token sent to chatId ${conversation.chatId} for user ${userId}`);

      res.status(HttpStatus.OK).json({
        success: true,
      } satisfies ApiResponse);
    } catch (error) {
      this.logger.error('Failed to send Telegram message', { error, chatId: conversation.chatId });
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Erro ao enviar mensagem no Telegram.',
      } satisfies ApiResponse);
    }
  }

  // ============================================================================
  // Counter Offer Settings
  // ============================================================================

  /**
   * GET /dashboard/:token/counter-offer/templates - Get available counter offer message templates
   */
  @Get(':token/counter-offer/templates')
  async getCounterOfferTemplates(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const templates = COUNTER_OFFER_TEMPLATE_IDS.map((id) => ({
      id,
      description: COUNTER_OFFER_TEMPLATE_DESCRIPTIONS[id],
      preview: COUNTER_OFFER_TEMPLATES[id],
    }));

    res.status(HttpStatus.OK).json({
      success: true,
      data: { templates },
    } satisfies ApiResponse<CounterOfferTemplatesResponse>);
  }

  /**
   * GET /dashboard/:token/call-to-action/templates - Get available call to action message templates
   */
  @Get(':token/call-to-action/templates')
  async getCallToActionTemplates(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const templates = CALL_TO_ACTION_TEMPLATE_IDS.map((id) => ({
      id,
      description: CALL_TO_ACTION_TEMPLATE_DESCRIPTIONS[id],
      preview: CALL_TO_ACTION_TEMPLATES[id],
    }));

    res.status(HttpStatus.OK).json({
      success: true,
      data: { templates },
    } satisfies ApiResponse<CallToActionTemplatesResponse>);
  }

  /**
   * GET /dashboard/:token/counter-offer - Get counter offer settings
   */
  @Get(':token/counter-offer')
  async getCounterOfferSettings(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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

    res.status(HttpStatus.OK).json({
      success: true,
      data: response,
    } satisfies ApiResponse<CounterOfferSettingsResponse>);
  }

  /**
   * PUT /dashboard/:token/counter-offer - Update counter offer settings
   */
  @Put(':token/counter-offer')
  async updateCounterOfferSettings(
    @Param('token') token: string,
    @Body() body: UpdateCounterOfferSettingsDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * GET /dashboard/:token/groups - Get user's active groups with titles
   */
  @Get(':token/groups')
  async getActiveGroups(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    // Get telegramUserId for making Telegram API calls
    const telegramUserId = await this.getTelegramUserIdFromLoggedInUser(userId);
    if (!telegramUserId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'user_not_logged_in',
      } satisfies ApiResponse);
      return;
    }

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
   * GET /dashboard/:token/available-groups - Get all groups the user can activate
   * Returns all groups/supergroups from Telegram with isActive status
   * Uses single HTTP call to TDLib worker for better performance
   */
  @Get(':token/available-groups')
  async getAvailableGroups(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    // Get telegramUserId for making Telegram API calls
    const telegramUserId = await this.getTelegramUserIdFromLoggedInUser(userId);
    if (!telegramUserId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'user_not_logged_in',
      } satisfies ApiResponse);
      return;
    }

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
   * POST /dashboard/:token/groups/:groupId - Activate a group
   * Validates that the group exists and is a group/supergroup before activating
   */
  @Post(':token/groups/:groupId')
  async activateGroup(
    @Param('token') token: string,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const groupIdNum = parseInt(groupId, 10);
    if (Number.isNaN(groupIdNum)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'invalid_group_id',
      } satisfies ApiResponse);
      return;
    }

    // Get telegramUserId for making Telegram API calls
    const telegramUserId = await this.getTelegramUserIdFromLoggedInUser(userId);
    if (!telegramUserId) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'user_not_logged_in',
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
   * DELETE /dashboard/:token/groups/:groupId - Deactivate a group
   */
  @Delete(':token/groups/:groupId')
  async deactivateGroup(
    @Param('token') token: string,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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
   * GET /dashboard/:token/bot-status - Get bot enabled/disabled status
   */
  @Get(':token/bot-status')
  async getBotStatus(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const isEnabled = await this.botStatusRepository.getBotStatus(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: { isEnabled },
    } satisfies ApiResponse<BotStatusResponse>);
  }

  /**
   * PUT /dashboard/:token/bot-status - Update bot enabled/disabled status
   */
  @Put(':token/bot-status')
  async updateBotStatus(
    @Param('token') token: string,
    @Body() body: UpdateBotStatusDto,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    if (typeof body.isEnabled !== 'boolean') {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'isEnabled must be a boolean',
      } satisfies ApiResponse);
      return;
    }

    await this.botStatusRepository.setBotStatus(userId, body.isEnabled);

    this.logger.log(`Updated bot status for user ${userId}: enabled=${body.isEnabled}`);

    res.status(HttpStatus.OK).json({
      success: true,
    } satisfies ApiResponse);
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * GET /dashboard/:token/subscription - Get subscription status summary
   */
  @Get(':token/subscription')
  async getSubscriptionStatus(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const subscription = await this.subscriptionService.getSubscription(userId);
    const hasUsedTrial = await this.subscriptionService.hasUsedTrial(userId);

    // Generate subscription page URL
    let subscriptionPageUrl: string | null = null;
    try {
      const ttlMinutes = this.appConfig.getSubscriptionTokenTtlMinutes();
      const { token: subscriptionToken } = await this.subscriptionTokenRepository.createToken(
        userId,
        ttlMinutes,
      );
      const baseUrl = this.appConfig.getAppBaseUrl();
      subscriptionPageUrl = `${baseUrl}/subscription/${subscriptionToken}`;
    } catch (error) {
      this.logger.warn('Failed to generate subscription page URL', { error, userId });
    }

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
   * POST /dashboard/:token/subscription/generate-link - Generate subscription management link
   */
  @Post(':token/subscription/generate-link')
  async generateSubscriptionLink(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

    const ttlMinutes = this.appConfig.getSubscriptionTokenTtlMinutes();
    const { token: subscriptionToken, expiresAt } = await this.subscriptionTokenRepository.createToken(
      userId,
      ttlMinutes,
    );

    const baseUrl = this.appConfig.getAppBaseUrl();
    const subscriptionUrl = `${baseUrl}/subscription/${subscriptionToken}`;

    this.logger.log(`Generated subscription link for user ${userId}`);

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        url: subscriptionUrl,
        expiresAt: expiresAt.toISOString(),
      },
    } satisfies ApiResponse<SubscriptionLinkResponse>);
  }

  /**
   * POST /dashboard/:token/subscription/trial - Start a free trial
   */
  @Post(':token/subscription/trial')
  async startTrial(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.validateAndGetUserId(token, res);
    if (!userId) return;

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

  // ============================================================================
  // Helper methods
  // ============================================================================

  /**
   * Get the telegramUserId from loggedInUserId
   * The token stores loggedInUserId, but the worker is identified by telegramUserId
   */
  private async getTelegramUserIdFromLoggedInUser(loggedInUserId: string): Promise<number | null> {
    const conversation = await this.conversationRepository.getCompletedConversationByLoggedInUserId(
      parseInt(loggedInUserId, 10),
    );
    return conversation?.telegramUserId ?? null;
  }

  /**
   * Validate token and get user ID, or send error response
   */
  private async validateAndGetUserId(token: string, res: Response): Promise<string | null> {
    const validation = await this.dashboardTokenRepository.validateToken(token);

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        not_found: 'token_not_found',
        expired: 'token_expired',
      };

      res.status(this.getHttpStatusForError(validation.error)).json({
        success: false,
        error: validation.error ? errorMessages[validation.error] : 'unknown_error',
      } satisfies ApiResponse);
      return null;
    }

    return validation.token?.userId ?? null;
  }

  /**
   * Map error type to HTTP status code
   */
  private getHttpStatusForError(error?: string): HttpStatus {
    switch (error) {
      case 'not_found':
        return HttpStatus.NOT_FOUND;
      case 'expired':
        return HttpStatus.GONE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  /**
   * Generate error HTML page
   */
  private getErrorHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Erro - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { color: #e74c3c; font-size: 24px; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Erro</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
