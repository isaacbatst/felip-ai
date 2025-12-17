import { AppConfigService } from '@/config/app.config';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TelegramUserClientProxyService } from './telegram-user-client-proxy.service';

/**
 * Module responsável por serviços relacionados ao TDLib
 * Agrupa providers que interagem com tdlib_worker via HTTP (for most operations) or BullMQ (for login and updates)
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'tdlib-commands',
    }),
  ],
  providers: [
    AppConfigService,
    TelegramUserClientProxyService,
  ],
  exports: [TelegramUserClientProxyService],
})
export class TdlibModule {}
