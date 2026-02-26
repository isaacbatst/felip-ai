import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';
import { DomainModule } from './domain/domain.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { CLS_TRACE_ID } from './infrastructure/logging/log-context';

/**
 * Root module da aplicação
 * Composition: compõe DomainModule e InfrastructureModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls) => {
          cls.set(CLS_TRACE_ID, randomUUID().slice(0, 8));
        },
      },
    }),
    DomainModule,
    InfrastructureModule,
  ],
})
export class AppModule {}
