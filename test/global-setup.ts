import './setup-env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '../src/shared/database/database-url';

// Antes de las pruebas se aplican las migraciones en la base de pruebas (grill de la #42, pregunta 3),
// con la misma protección: solo una base cuyo nombre termina en _test.
export default async function globalSetup(): Promise<void> {
  const url = resolveDatabaseUrl({
    NODE_ENV: 'test',
    DATABASE_URL: process.env['DATABASE_URL'] ?? '',
    DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
  });
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  } finally {
    await pool.end();
  }
}
