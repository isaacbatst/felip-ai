import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';
import { AuthTokenRepository } from '@/infrastructure/persistence/auth-token.repository';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { AuthCodeDeduplicationService } from '@/infrastructure/telegram/auth-code-deduplication.service';

interface SubmitCodeDto {
  code: string;
}

interface TokenStatusResponse {
  valid: boolean;
  error?: string;
  expiresAt?: string;
  remainingAttempts?: number;
}

interface SubmitCodeResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * HTTP Controller for web-based authentication code input
 * Handles token validation and code submission via a web page
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly maxAttempts = 3;

  constructor(
    private readonly authTokenRepository: AuthTokenRepository,
    private readonly telegramUserClient: TelegramUserClientProxyService,
    private readonly authCodeDedup: AuthCodeDeduplicationService,
  ) {}

  /**
   * GET /auth/:token - Serve the auth code input page
   * Validates the token and serves the HTML page if valid
   */
  @Get(':token')
  async getAuthPage(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Auth page requested for token: ${token.substring(0, 8)}...`);

    const validation = await this.authTokenRepository.validateToken(token);

    if (!validation.valid) {
      // Serve error page based on error type
      const errorMessages: Record<string, string> = {
        not_found: 'Link inválido ou expirado.',
        expired: 'Este link expirou. Por favor, inicie o processo de login novamente.',
        already_used: 'Este link já foi utilizado. Por favor, inicie o processo de login novamente.',
        max_attempts: 'Número máximo de tentativas excedido. Por favor, inicie o processo de login novamente.',
      };

      const errorMessage = validation.error ? errorMessages[validation.error] : 'Erro desconhecido.';

      res.status(this.getHttpStatusForError(validation.error)).send(this.getErrorHtml(errorMessage));
      return;
    }

    // Serve the auth page
    // Path: dist/infrastructure/http -> dist/public/auth.html
    res.sendFile(join(__dirname, '..', '..', 'public', 'auth.html'));
  }

  /**
   * GET /auth/:token/status - Check token validity and get status
   */
  @Get(':token/status')
  async getTokenStatus(
    @Param('token') token: string,
  ): Promise<TokenStatusResponse> {
    const validation = await this.authTokenRepository.validateToken(token);

    if (!validation.valid) {
      return {
        valid: false,
        error: validation.error,
      };
    }

    return {
      valid: true,
      expiresAt: validation.token?.expiresAt.toISOString(),
      remainingAttempts: this.maxAttempts - (validation.token?.attempts ?? 0),
    };
  }

  /**
   * POST /auth/:token/code - Submit the authentication code
   */
  @Post(':token/code')
  async submitCode(
    @Param('token') token: string,
    @Body() body: SubmitCodeDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Code submission for token: ${token.substring(0, 8)}...`);

    // Validate token
    const validation = await this.authTokenRepository.validateToken(token);

    if (!validation.valid) {
      const errorMessages: Record<string, string> = {
        not_found: 'token_not_found',
        expired: 'token_expired',
        already_used: 'token_already_used',
        max_attempts: 'max_attempts_exceeded',
      };

      res.status(this.getHttpStatusForError(validation.error)).json({
        success: false,
        error: validation.error ? errorMessages[validation.error] : 'unknown_error',
      } satisfies SubmitCodeResponse);
      return;
    }

    // Normalize the code
    const normalizedCode = body.code?.trim().replace(/[\s-]/g, '') || '';

    // Validate code format
    if (!/^\d+$/.test(normalizedCode)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'invalid_code_format',
      } satisfies SubmitCodeResponse);
      return;
    }

    // Increment attempt counter
    const attempts = await this.authTokenRepository.incrementAttempts(token);
    if (attempts > this.maxAttempts) {
      res.status(HttpStatus.GONE).json({
        success: false,
        error: 'max_attempts_exceeded',
      } satisfies SubmitCodeResponse);
      return;
    }

    const session = validation.session;
    const tokenData = validation.token;

    // These should never be null after successful validation, but check anyway
    if (!session || !tokenData) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'validation_error',
      } satisfies SubmitCodeResponse);
      return;
    }

    const requestId = tokenData.requestId;

    // Check deduplication
    const wasSet = this.authCodeDedup.setIfNotExists(requestId, normalizedCode);
    if (!wasSet) {
      res.status(HttpStatus.CONFLICT).json({
        success: false,
        error: 'code_already_submitted',
      } satisfies SubmitCodeResponse);
      return;
    }

    // Phone number is required for auth code submission
    if (!session.phoneNumber) {
      this.authCodeDedup.delete(requestId);
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: 'missing_phone_number',
      } satisfies SubmitCodeResponse);
      return;
    }

    try {
      // Send auth code to worker
      await this.telegramUserClient.provideAuthCode(
        session.loggedInUserId.toString(),
        requestId,
        normalizedCode,
        {
          userId: session.telegramUserId,
          chatId: session.chatId,
          phoneNumber: session.phoneNumber,
          state: session.state,
        },
      );

      // Mark token as used
      await this.authTokenRepository.markTokenAsUsed(token);

      this.logger.log(`Auth code submitted successfully for requestId: ${requestId}`);

      res.status(HttpStatus.OK).json({
        success: true,
        message: 'Código enviado! Verifique o Telegram para o resultado.',
      } satisfies SubmitCodeResponse);
    } catch (error) {
      // Clear dedup on error to allow retry
      this.authCodeDedup.delete(requestId);

      this.logger.error(`Error submitting auth code: ${error}`);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'submission_failed',
      } satisfies SubmitCodeResponse);
    }
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
      case 'already_used':
        return HttpStatus.CONFLICT;
      case 'max_attempts':
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
  <title>Erro - Felip AI</title>
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
    <div class="icon">❌</div>
    <h1>Erro</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  }
}
