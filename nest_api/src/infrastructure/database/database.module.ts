import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Database module for Drizzle ORM with Neon PostgreSQL
 * Provides a global database connection instance
 */
@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const connectionString = configService.get<string>('DATABASE_URL');
        
        if (!connectionString) {
          throw new Error('DATABASE_URL environment variable is required');
        }

        // Create postgres connection
        const client = postgres(connectionString, {
          max: 10,
        });

        // Create drizzle instance
        const db = drizzle(client, { schema });
        return db as PostgresJsDatabase<typeof schema>;
      },
    },
    {
      provide: 'DRIZZLE_SCHEMA',
      useValue: schema,
    },
  ],
  exports: ['DATABASE_CONNECTION', 'DRIZZLE_SCHEMA'],
})
export class DatabaseModule {}

