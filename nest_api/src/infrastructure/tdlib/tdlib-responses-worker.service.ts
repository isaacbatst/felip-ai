import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

interface TdlibResponse {
  requestId: string;
  result?: unknown;
  error?: string;
}

/**
 * Worker that consumes responses from tdlib_worker via BullMQ
 * Note: The actual response handling is done in TelegramUserClientProxyService
 * This worker is registered but the proxy service handles responses directly via its own worker
 * Single Responsibility: placeholder worker for responses queue (actual handling in proxy service)
 */
@Processor('tdlib-responses')
@Injectable()
export class TdlibResponsesWorkerService extends WorkerHost {
  private readonly logger = new Logger(TdlibResponsesWorkerService.name);


  async process(job: Job<TdlibResponse, unknown, string>): Promise<void> {
    // Responses are handled by TelegramUserClientProxyService's internal worker
    // This processor is kept for queue registration but doesn't process jobs
    // as the proxy service handles them directly
    this.logger.debug(`Response job ${job.id} received (handled by proxy service)`);
  }
}

