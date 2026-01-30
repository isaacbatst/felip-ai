import {
  Controller,
  Get,
  Put,
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

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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

  // ============================================================================
  // Helper methods
  // ============================================================================

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
