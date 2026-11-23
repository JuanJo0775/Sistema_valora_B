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
  "('identity', 'catalog', 'establishments', 'pricing', 'reliability', 'comparison', 'commerce', 'shared')",
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
      'commerce',
      'comparison',
      'establishments',
      'identity',
      'pricing',
      'reliability',
      'shared',
    ]);
  });

  it('el correo y la contraseña solo están en identity.accounts', () => {
    // ADR-029: email_verified_at es solo la fecha en que se comprobó el correo, no el correo.
    expect(named(/email|correo|password|contrasena/)).toEqual([
      'identity.accounts.email',
      'identity.accounts.email_verified_at',
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
    // D5 (#207): la de una corrección es la ubicación nueva de la tienda, no la de quien la pide.
    expect(geographic.sort()).toEqual([
      'establishments.establishments.location',
      'establishments.store_corrections.location',
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
        .map((column) => `${column.table_schema}.${column.table_name}.${column.column_name}`)
        .sort(),
    ).toEqual([
      'commerce.merchant_claim_rejections.account_id',
      'commerce.merchant_claims.account_id',
      'commerce.merchant_notices.account_id',
      'pricing.reports.reporter_id',
    ]);
    // Grill de la #36, pregunta 1: reporter_id es una referencia interna de pricing (idempotencia,
    // duplicado y ráfaga); privacy-public-responses.spec.ts verifica que nunca sale.
    // D3 del grill comercial (#201, #202): commerce guarda la cuenta DUEÑA de la tienda (no la de un
    // reportante) para «una tienda por cuenta»; solo la ve la propia cuenta en GET /commerce/me.
    // B9 (#209): merchant_notices recuerda lo avisado por correo al dueño, que nunca ve su correo.
    // ADR-032 (#208): al borrar la cuenta, AccountPurged borra estas filas (commerce-cases-http.spec.ts
    // y commerce-notices-repository.spec.ts).
  });

  // ADR-029: la verificación de correo vive en identity y no guarda el token en claro.
  it('la tabla de verificación de correo está en identity y solo guarda el hash del token', () => {
    const verification = columns
      .filter((column) => column.table_name === 'email_verifications')
      .map((column) => `${column.table_schema}.${column.column_name}`)
      .sort();

    expect(verification).toEqual([
      'identity.account_id',
      'identity.created_at',
      'identity.expires_at',
      'identity.id',
      'identity.token_hash',
      'identity.used_at',
    ]);
    expect(named(/^token$|^verification_token$|^plain_token$/)).toEqual([]);
  });

  // ADR-033: el restablecimiento de contraseña vive en identity, guarda solo el hash del token y fechas
  // (ni el correo, ni la IP, ni la contraseña) y se borra en cascada con la cuenta.
  it('la tabla de restablecimiento de contraseña solo guarda el hash del token y fechas', () => {
    const resets = columns
      .filter((column) => column.table_name === 'password_resets')
      .map((column) => `${column.table_schema}.${column.column_name}`)
      .sort();

    expect(resets).toEqual([
      'identity.account_id',
      'identity.created_at',
      'identity.expires_at',
      'identity.id',
      'identity.token_hash',
      'identity.used_at',
    ]);
    expect(named(/^token$|^reset_token$|^plain_token$/)).toEqual([]);
  });

  it('la llave de password_resets borra en cascada con la cuenta (la purga no deja enlaces)', async () => {
    const result = await db.execute<{ delete_rule: string }>(
      sql`select rc.delete_rule from information_schema.referential_constraints rc
          join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
          where tc.table_schema = 'identity' and tc.table_name = 'password_resets'
            and tc.constraint_type = 'FOREIGN KEY'`,
    );

    expect(result.rows.map((row) => row.delete_rule)).toEqual(['CASCADE']);
  });

  // ADR-032: la eliminación pendiente es solo una fecha dentro de identity.accounts. La cuenta se borra por
  // completo: ninguna otra tabla guarda una copia ni una «cuenta borrada» con sus datos.
  it('la eliminación pendiente solo guarda una fecha en identity.accounts', () => {
    expect(named(/deletion|deleted|eliminad|eliminacion/)).toEqual([
      'identity.accounts.deletion_scheduled_for',
    ]);
    const type = columns.find((column) => column.column_name === 'deletion_scheduled_for');
    expect(type?.udt_name).toBe('timestamptz');
  });
});
