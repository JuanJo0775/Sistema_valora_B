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

// Los esquemas de la aplicación (un pgSchema por módulo, ADR-003, más shared). Se revisan solo
// estos: la imagen de PostGIS de la CI trae otros, como el geocodificador «tiger», que no son de
// Valora. Un módulo nuevo debe agregarse aquí.
const APP_SCHEMAS = sql.raw(
  "('identity', 'catalog', 'establishments', 'pricing', 'reliability', 'comparison', 'shared')",
);

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
          where table_schema in ${APP_SCHEMAS}`,
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

  it('revisa los esquemas de todos los módulos', () => {
    expect([...new Set(columns.map((column) => column.table_schema))].sort()).toEqual([
      'catalog',
      'comparison',
      'establishments',
      'identity',
      'pricing',
      'reliability',
      'shared',
    ]);
  });

  it('el correo y la contraseña solo están en identity.accounts', () => {
    expect(named(/email|correo|password|contrasena/)).toEqual([
      'identity.accounts.email',
      'identity.accounts.password_hash',
    ]);
  });

  it('las únicas columnas geográficas son ubicaciones de tiendas', () => {
    const geographic = columns
      .filter(
        (column) =>
          ['geography', 'geometry'].includes(column.udt_name) ||
          /^(lat|lng|lon|latitude|longitude)$/.test(column.column_name),
      )
      .map((column) => `${column.table_schema}.${column.table_name}.${column.column_name}`);

    // Grill de la #27: la de una tienda propuesta también es de la tienda, no de quien la propone.
    expect(geographic.sort()).toEqual([
      'establishments.establishments.location',
      'establishments.store_proposals.location',
    ]);
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
