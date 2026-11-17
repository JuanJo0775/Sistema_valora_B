import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env.validation';
import { databaseNameOf, resolveDatabaseUrl } from './database-url';

// Motivo legible del fallo: el código de red (por ejemplo, ECONNREFUSED) o el mensaje del error.
function reasonOf(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string') return code;
  return error instanceof Error && error.message ? error.message : 'error desconocido';
}

export type Database = NodePgDatabase;

// Transacción de Drizzle: la reciben los repositorios para guardar su cambio y sus eventos juntos.
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

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

// Comprueba la conexión al arrancar y cierra el pool al apagar, para que el proceso (y Jest) terminen limpio.
@Injectable()
class DatabaseLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  // Grill de la #42, pregunta 6: sin base no arranca; el mensaje nunca incluye la contraseña.
  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query('select 1');
    } catch (error) {
      await this.pool.end();
      // Se leen solo host, puerto y base de la URL: la contraseña nunca entra al mensaje.
      const url = new URL(this.pool.options.connectionString ?? '');
      const target = `${databaseNameOf(url.href)} en ${url.hostname}:${url.port || '5432'}`;
      throw new Error(`No se pudo conectar a la base de datos ${target}: ${reasonOf(error)}`, {
        cause: error,
      });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [poolProvider, databaseProvider, DatabaseLifecycle],
  exports: [DATABASE],
})
export class DatabaseModule {}
