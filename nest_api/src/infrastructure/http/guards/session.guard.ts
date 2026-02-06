import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { WebSessionRepository } from '@/infrastructure/persistence/web-session.repository';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly webSessionRepository: WebSessionRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.session_token;

    if (!token) throw new UnauthorizedException();

    const result = await this.webSessionRepository.validateSession(token);
    if (!result.valid) throw new UnauthorizedException();

    // Sliding expiration
    await this.webSessionRepository.refreshSession(token);

    request.user = { userId: result.userId };
    return true;
  }
}
