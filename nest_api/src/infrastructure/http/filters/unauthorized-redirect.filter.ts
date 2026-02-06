import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express';

@Catch(UnauthorizedException)
export class UnauthorizedRedirectFilter implements ExceptionFilter {
  catch(_exception: UnauthorizedException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const acceptHeader = request.headers.accept ?? '';
    const isBrowserRequest = acceptHeader.includes('text/html');

    if (isBrowserRequest) {
      response.redirect(302, '/login');
    } else {
      response.status(401).json({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
  }
}
