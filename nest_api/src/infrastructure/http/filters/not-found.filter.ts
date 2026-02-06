import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  NotFoundException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { join } from 'node:path';

@Catch(NotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(_exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const acceptHeader = request.headers.accept ?? '';
    const isBrowserRequest = acceptHeader.includes('text/html');

    if (isBrowserRequest) {
      response.status(404).sendFile(join(__dirname, '..', '..', '..', 'public', '404.html'));
    } else {
      response.status(404).json({
        statusCode: 404,
        message: 'Not Found',
      });
    }
  }
}
