import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { WholesaleReference } from '../../src/modules/catalog/application/wholesale-references';
import { DrizzleWholesaleReferenceRepository } from '../../src/modules/catalog/infrastructure/drizzle-wholesale-reference-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Referencias de prueba: solo existen dentro de esta prueba.
const productId = 'f5111111-1111-4111-8111-111111111111';
const reference: WholesaleReference = {
  id: 'f5222222-2222-4222-8222-000000000001',
  productId,
  sipsaName: 'Arroz blanco importado',
  market: 'Armenia, Mercar',
  periodStart: '2026-11-02',
  periodEnd: '2026-11-08',
  pricePerKgCop: 3100,
  sourceUrl: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
  responsible: 'Integrante del equipo',
  consultedAt: '2026-11-15',
};

describe('referencias SIPSA en catalog (RF-014, #34)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let references: DrizzleWholesaleReferenceRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    references = new DrizzleWholesaleReferenceRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate catalog.wholesale_references`);
  });

  it('da la referencia del periodo más reciente, sin el responsable de la carga', async () => {
    await references.save(reference);
    await references.save({
      ...reference,
      id: 'f5222222-2222-4222-8222-000000000002',
      periodStart: '2026-11-09',
      periodEnd: '2026-11-15',
      pricePerKgCop: 3200,
    });

    await expect(references.latestFor(productId)).resolves.toEqual({
      productId,
      sipsaName: 'Arroz blanco importado',
      market: 'Armenia, Mercar',
      periodStart: '2026-11-09',
      periodEnd: '2026-11-15',
      pricePerKgCop: 3200,
      sourceUrl: 'https://www.dane.gov.co/sipsa/boletin.xlsx',
    });
  });

  it('volver a cargar la misma referencia la actualiza sin duplicarla; sin referencia, nada', async () => {
    await references.save(reference);
    await references.save({ ...reference, pricePerKgCop: 3150 });

    const count = await db.execute<{ total: number }>(
      sql`select count(*)::int as total from catalog.wholesale_references`,
    );
    expect(count.rows[0]).toEqual({ total: 1 });
    expect((await references.latestFor(productId))?.pricePerKgCop).toBe(3150);
    await expect(references.latestFor('f5111111-1111-4111-8111-999999999999')).resolves.toBeNull();
  });
});
