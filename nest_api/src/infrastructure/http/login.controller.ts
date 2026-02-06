import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { WebSessionRepository } from '@/infrastructure/persistence/web-session.repository';
import { UserRepository } from '@/infrastructure/persistence/user.repository';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { OtpService } from '@/infrastructure/auth/otp.service';
import { RegistrationTokenService } from '@/infrastructure/auth/registration-token.service';
import { AppConfigService } from '@/config/app.config';

@Controller('login')
export class LoginController {
  private readonly logger = new Logger(LoginController.name);

  constructor(
    private readonly webSessionRepository: WebSessionRepository,
    private readonly phoneWhitelistService: PhoneWhitelistService,
    private readonly otpService: OtpService,
    private readonly userRepository: UserRepository,
    private readonly registrationTokenService: RegistrationTokenService,
    private readonly appConfig: AppConfigService,
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
  async submitPhone(
    @Body() body: { phone: string; registrationToken?: string },
  ): Promise<{ success: boolean; expiresAt: Date }> {
    const { phone, registrationToken } = body;

    if (!phone || !phone.startsWith('+')) {
      throw new HttpException('Número de telefone deve começar com +', HttpStatus.BAD_REQUEST);
    }

    const mode = this.appConfig.getAuthorizationMode();
    if (mode === 'whitelist' && !this.phoneWhitelistService.isAllowed(phone)) {
      throw new HttpException('Número não autorizado', HttpStatus.BAD_REQUEST);
    }

    let user = await this.userRepository.findByPhone(phone);

    if (!user && registrationToken) {
      const tokenData = this.registrationTokenService.consume(registrationToken);
      if (!tokenData) {
        throw new HttpException('Token de registro inválido ou expirado. Envie /start no bot novamente.', HttpStatus.BAD_REQUEST);
      }
      user = await this.userRepository.createUser({
        phone,
        telegramUserId: tokenData.telegramUserId,
        chatId: tokenData.chatId,
      });
      this.logger.log(`User registered via token: telegramUserId=${tokenData.telegramUserId}, phone=${phone}`);
    }

    if (!user) {
      throw new HttpException('Registre-se com /start no bot @lfviagenschatbot', HttpStatus.BAD_REQUEST);
    }

    try {
      const { expiresAt } = await this.otpService.generateAndSend(phone);
      this.logger.log(`OTP requested for phone: ${phone}`);
      return { success: true, expiresAt };
    } catch (error) {
      this.logger.error(
        `Failed to generate/send OTP for phone=${phone}`,
        error instanceof Error ? error.stack : String(error),
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Erro ao enviar código. Tente novamente.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('verify')
  @HttpCode(200)
  async verifyOtp(
    @Body() body: { phone: string; code: string },
    @Res() res: Response,
  ): Promise<void> {
    const { phone, code } = body;

    if (!phone || !phone.startsWith('+')) {
      res.status(400).json({ message: 'Número de telefone inválido' });
      return;
    }

    if (!code || !/^\d{6}$/.test(code)) {
      res.status(400).json({ message: 'Código deve conter 6 dígitos' });
      return;
    }

    const { valid, userId } = await this.otpService.validate(phone, code);

    if (!valid || !userId) {
      res.status(401).json({ message: 'Código inválido ou expirado' });
      return;
    }

    const { token } = await this.webSessionRepository.createSession(userId);

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    res.json({ success: true });
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
