import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { WebSessionRepository } from '@/infrastructure/persistence/web-session.repository';

@Controller('register')
export class RegisterController {
  constructor(
    private readonly webSessionRepository: WebSessionRepository,
  ) {}

  @Get()
  async getRegisterPage(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const token = req.cookies?.session_token;
    if (token) {
      const result = await this.webSessionRepository.validateSession(token);
      if (result.valid) {
        res.redirect(302, '/dashboard');
        return;
      }
    }
    res.sendFile(join(__dirname, '..', '..', 'public', 'register.html'));
  }
}
