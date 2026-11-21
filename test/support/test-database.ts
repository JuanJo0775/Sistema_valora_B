import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Conexión a valora_test para las pruebas de repositorios. Quien la abre la cierra con pool.end().
export function openTestDatabase(): { pool: Pool; db: NodePgDatabase } {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl({
      NODE_ENV: 'test',
      DATABASE_URL: process.env['DATABASE_URL'] ?? '',
      DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
    }),
  });
  return { pool, db: drizzle(pool) };
}
