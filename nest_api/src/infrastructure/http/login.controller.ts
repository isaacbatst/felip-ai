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

@Controller('login')
export class LoginController {
  private readonly logger = new Logger(LoginController.name);

  constructor(
    private readonly webSessionRepository: WebSessionRepository,
    private readonly phoneWhitelistService: PhoneWhitelistService,
    private readonly otpService: OtpService,
    private readonly userRepository: UserRepository,
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
  async submitPhone(@Body() body: { phone: string }): Promise<{ success: boolean; expiresAt: Date }> {
    const { phone } = body;

    if (!phone || !phone.startsWith('+')) {
      throw new HttpException('Número de telefone deve começar com +', HttpStatus.BAD_REQUEST);
    }

    if (!this.phoneWhitelistService.isAllowed(phone)) {
      throw new HttpException('Número não autorizado', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userRepository.findByPhone(phone);
    if (!user) {
      throw new HttpException('Inicie o bot primeiro', HttpStatus.BAD_REQUEST);
    }

    const { expiresAt } = await this.otpService.generateAndSend(phone);

    this.logger.log(`OTP requested for phone: ${phone}`);

    return { success: true, expiresAt };
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
