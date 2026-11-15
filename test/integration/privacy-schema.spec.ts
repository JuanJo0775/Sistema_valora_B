import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// type, no interface: db.execute pide un Record<string, unknown>.
type Column = {
  table_schema: string;
  table_name: string;
  column_name: string;
  udt_name: string;
};

// EC-08 y PR-15 (grill de la #36, pregunta 2): la base no guarda datos personales fuera de identity
// ni coordenadas del usuario. Si una migración nueva agrega una columna así, esta prueba falla.
describe('privacidad del esquema de la base (EC-08, #36)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let columns: Column[];

  beforeAll(async () => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    const result = await db.execute<Column>(
      sql`select table_schema, table_name, column_name, udt_name from information_schema.columns
          where table_schema not in ('pg_catalog', 'information_schema', 'public', 'topology', 'drizzle')`,
    );
    columns = result.rows;
  });

  afterAll(async () => {
    await pool.end();
  });

  const named = (pattern: RegExp) =>
    columns
      .filter((column) => pattern.test(column.column_name))
      .map((column) => `${column.table_schema}.${column.table_name}.${column.column_name}`)
      .sort();

  it('el correo y la contraseña solo están en identity.accounts', () => {
    expect(named(/email|correo|password|contrasena/)).toEqual([
      'identity.accounts.email',
      'identity.accounts.password_hash',
    ]);
  });

  it('la única columna geográfica es la ubicación pública de la tienda', () => {
    const geographic = columns
      .filter(
        (column) =>
          ['geography', 'geometry'].includes(column.udt_name) ||
          /^(lat|lng|lon|latitude|longitude)$/.test(column.column_name),
      )
      .map((column) => `${column.table_schema}.${column.table_name}.${column.column_name}`);

    expect(geographic).toEqual(['establishments.establishments.location']);
  });

  it('ninguna tabla guarda la IP de quien hace la petición', () => {
    expect(named(/(^|_)ip($|_)|ip_address|user_agent/)).toEqual([]);
  });

  it('fuera de identity, la cuenta solo aparece en pricing.reports; lo demás usa la clave seudónima', () => {
    const outsideIdentity = columns.filter((column) => column.table_schema !== 'identity');

    expect(
      outsideIdentity
        .filter((column) => /account|reporter_id|user_id/.test(column.column_name))
        .map((column) => `${column.table_schema}.${column.table_name}.${column.column_name}`),
    ).toEqual(['pricing.reports.reporter_id']);
    // Grill de la #36, pregunta 1: reporter_id es una referencia interna de pricing (idempotencia,
    // duplicado y ráfaga); privacy-public-responses.spec.ts verifica que nunca sale.
  });
});
