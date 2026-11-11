import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env.validation';
import { resolveDatabaseUrl } from './database-url';

export type Database = NodePgDatabase;

// Token para inyectar la instancia de Drizzle en los repositorios de infrastructure/.
export const DATABASE = Symbol('DATABASE');
const POOL = Symbol('POOL');

const poolProvider: Provider = {
  provide: POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Pool =>
    new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: config.get('NODE_ENV', { infer: true }),
        DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
        DATABASE_URL_TEST: config.get('DATABASE_URL_TEST', { infer: true }),
      }),
    }),
};

const databaseProvider: Provider = {
  provide: DATABASE,
  inject: [POOL],
  useFactory: (pool: Pool): Database => drizzle(pool),
};

// Cierra el pool al apagar la aplicación, para que el proceso (y Jest) terminen limpio.
@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [poolProvider, databaseProvider, PoolCloser],
  exports: [DATABASE],
})
export class DatabaseModule {}
