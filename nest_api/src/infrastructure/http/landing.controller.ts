import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'node:path';

/**
 * HTTP Controller for public landing page
 * Serves the landing page at the root path
 */
@Controller()
export class LandingController {
  /**
   * GET / - Serve the landing page
   */
  @Get()
  getLandingPage(@Res() res: Response): void {
    res.sendFile(join(__dirname, '..', '..', 'public', 'landing.html'));
  }
}
