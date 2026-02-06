import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Res,
  Req,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSessionRepository } from '@/infrastructure/persistence/web-session.repository';
import { ConversationRepository } from '@/infrastructure/persistence/conversation.repository';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { WorkerManager } from '@/infrastructure/workers/worker-manager';
import { TelegramUserClientProxyService } from '@/infrastructure/tdlib/telegram-user-client-proxy.service';
import { AuthCodeDeduplicationService } from '@/infrastructure/telegram/auth-code-deduplication.service';

@Controller('login')
export class LoginController {
  private readonly logger = new Logger(LoginController.name);

  constructor(
    private readonly webSessionRepository: WebSessionRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly phoneWhitelistService: PhoneWhitelistService,
    private readonly workerManager: WorkerManager,
    private readonly client: TelegramUserClientProxyService,
    private readonly authCodeDedup: AuthCodeDeduplicationService,
  ) {}

  @Get()
  async getLoginPage(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = req.cookies?.session_token;
    if (token) {
      const result = await this.webSessionRepository.validateSession(token);
      if (result.valid) {
        res.redirect(302, '/dashboard');
        return;
      }
    }
    res.sendFile(join(__dirname, '..', '..', 'public', 'login.html'));
  }

  @Post('phone')
  @HttpCode(200)
  async submitPhone(@Body() body: { phone: string }): Promise<{ requestId: string }> {
    const { phone } = body;

    if (!phone || !phone.startsWith('+')) {
      throw new HttpException('Número de telefone deve começar com +', HttpStatus.BAD_REQUEST);
    }

    if (!this.phoneWhitelistService.isAllowed(phone)) {
      throw new HttpException('Número não autorizado', HttpStatus.BAD_REQUEST);
    }

    const phoneAsNumber = parseInt(phone.replace('+', ''), 10);
    if (isNaN(phoneAsNumber)) {
      throw new HttpException('Número de telefone inválido', HttpStatus.BAD_REQUEST);
    }

    const userId = phoneAsNumber.toString();

    // Start worker
    await this.workerManager.run(userId);
    await this.workerManager.waitUntilHealthy(userId);

    const requestId = randomUUID();

    // Create conversation
    await this.conversationRepository.setConversation({
      requestId,
      loggedInUserId: phoneAsNumber,
      source: 'web',
      phoneNumber: phone,
      state: 'waitingPhone',
    });

    // Dispatch login
    await this.client.login(userId, phone, requestId);

    this.logger.log(`Web login initiated for phone: ${phone}, requestId: ${requestId}`);

    return { requestId };
  }

  @Get('status/:requestId')
  async getStatus(
    @Param('requestId') requestId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const conversation = await this.conversationRepository.getConversation(requestId);
    if (!conversation) {
      res.status(404).json({ error: 'Sessão não encontrada' });
      return;
    }

    if (conversation.state === 'completed') {
      // Check if session cookie already exists
      const existingToken = req.cookies?.session_token;
      if (existingToken) {
        const existing = await this.webSessionRepository.validateSession(existingToken);
        if (existing.valid) {
          res.json({ state: 'completed' });
          return;
        }
      }

      // Create web session
      const { token } = await this.webSessionRepository.createSession(
        conversation.loggedInUserId.toString(),
      );

      // Set cookie
      res.cookie('session_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });

      res.json({ state: 'completed' });
      return;
    }

    if (conversation.state === 'failed') {
      res.json({ state: 'failed', error: 'Login falhou' });
      return;
    }

    res.json({ state: conversation.state });
  }

  @Post('code')
  @HttpCode(200)
  async submitCode(@Body() body: { requestId: string; code: string }): Promise<{ success: boolean }> {
    const { requestId, code } = body;

    if (!code || !/^\d+$/.test(code)) {
      throw new HttpException('Código deve conter apenas dígitos', HttpStatus.BAD_REQUEST);
    }

    const conversation = await this.conversationRepository.getConversation(requestId);
    if (!conversation) {
      throw new HttpException('Sessão não encontrada', HttpStatus.NOT_FOUND);
    }

    // Deduplication check
    const isNew = this.authCodeDedup.setIfNotExists(requestId, code);
    if (!isNew) {
      throw new HttpException('Código já foi enviado', HttpStatus.CONFLICT);
    }

    try {
      await this.client.provideAuthCode(
        conversation.loggedInUserId.toString(),
        requestId,
        code,
        {
          userId: conversation.loggedInUserId,
          chatId: 0,
          phoneNumber: conversation.phoneNumber ?? '',
          state: conversation.state,
        },
      );
      return { success: true };
    } catch (error) {
      this.authCodeDedup.delete(requestId);
      this.logger.error('Failed to submit auth code', { requestId, error });
      throw new HttpException('Erro ao enviar código', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('password')
  @HttpCode(200)
  async submitPassword(@Body() body: { requestId: string; password: string }): Promise<{ success: boolean }> {
    const { requestId, password } = body;

    if (!password) {
      throw new HttpException('Senha é obrigatória', HttpStatus.BAD_REQUEST);
    }

    const conversation = await this.conversationRepository.getConversation(requestId);
    if (!conversation) {
      throw new HttpException('Sessão não encontrada', HttpStatus.NOT_FOUND);
    }

    // Deduplication check
    const dedupKey = `password:${requestId}`;
    const isNew = this.authCodeDedup.setIfNotExists(dedupKey, password);
    if (!isNew) {
      throw new HttpException('Senha já foi enviada', HttpStatus.CONFLICT);
    }

    try {
      await this.client.providePassword(
        conversation.loggedInUserId.toString(),
        requestId,
        password,
        {
          userId: conversation.loggedInUserId,
          chatId: 0,
          phoneNumber: conversation.phoneNumber ?? '',
          state: conversation.state,
        },
      );
      return { success: true };
    } catch (error) {
      this.authCodeDedup.delete(dedupKey);
      this.logger.error('Failed to submit password', { requestId, error });
      throw new HttpException('Erro ao enviar senha', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const token = req.cookies?.session_token;
    if (token) {
      await this.webSessionRepository.deleteSession(token);
    }
    res.clearCookie('session_token', { path: '/' });
    res.redirect(302, '/login');
  }
}
