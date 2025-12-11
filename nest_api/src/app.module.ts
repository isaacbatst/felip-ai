import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DomainModule } from './domain/domain.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

/**
 * Root module da aplicação
 * Composition: compõe DomainModule e InfrastructureModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DomainModule,
    InfrastructureModule,
  ],
})
export class AppModule {}
