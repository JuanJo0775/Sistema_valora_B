import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NewStoreProposal } from '../../src/modules/establishments/application/store-proposals';
import { DrizzleEstablishmentImportRepository } from '../../src/modules/establishments/infrastructure/drizzle-establishment-import-repository';
import { DrizzleEstablishmentRepository } from '../../src/modules/establishments/infrastructure/drizzle-establishment-repository';
import { DrizzleStoreProposalRepository } from '../../src/modules/establishments/infrastructure/drizzle-store-proposal-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Propuestas y tiendas de prueba: solo existen dentro de esta prueba.
const proposal: NewStoreProposal = {
  id: 'ef111111-1111-4111-8111-111111111111',
  name: 'Tienda Esperanza',
  type: 'barrio',
  address: 'Cra. 14 # 20-10',
  lat: 4.5339,
  lng: -75.6811,
  municipality: 'calarca',
  proposerKey: 'a'.repeat(64),
  createdAt: new Date('2026-11-15T10:00:00Z'),
};
const decision = {
  note: 'Tienda verificada en el sitio',
  moderatorKey: 'c'.repeat(64),
  decidedAt: new Date('2026-11-15T12:00:00Z'),
};

describe('propuestas de tiendas (RF-005, #27)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let proposals: DrizzleStoreProposalRepository;
  let stores: DrizzleEstablishmentRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    proposals = new DrizzleStoreProposalRepository(db);
    stores = new DrizzleEstablishmentRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate establishments.establishments, establishments.store_proposals`);
  });

  it('una propuesta queda pendiente y no aparece entre las tiendas', async () => {
    await proposals.save(proposal);

    await expect(proposals.pending()).resolves.toEqual([proposal]);
    await expect(stores.findById(proposal.id)).resolves.toBeNull();
  });

  it('aprobarla crea la tienda con el id de la propuesta y la saca de las pendientes', async () => {
    await proposals.save(proposal);

    await expect(
      proposals.decide({ proposalId: proposal.id, decision: 'aprobar', ...decision }),
    ).resolves.toBe(true);

    await expect(proposals.pending()).resolves.toEqual([]);
    await expect(stores.findById(proposal.id)).resolves.toEqual({
      id: proposal.id,
      name: 'Tienda Esperanza',
      type: 'barrio',
      address: 'Cra. 14 # 20-10',
      lat: 4.5339,
      lng: -75.6811,
      // Grill de la #106: la tienda aprobada queda en el municipio de la propuesta.
      municipality: 'calarca',
    });
    // Una propuesta ya decidida no se decide otra vez.
    await expect(
      proposals.decide({ proposalId: proposal.id, decision: 'rechazar', ...decision }),
    ).resolves.toBe(false);
  });

  it('rechazarla o fusionarla no crea ninguna tienda', async () => {
    await proposals.save(proposal);
    await proposals.save({ ...proposal, id: 'ef111111-1111-4111-8111-222222222222' });

    await proposals.decide({ proposalId: proposal.id, decision: 'rechazar', ...decision });
    await proposals.decide({
      proposalId: 'ef111111-1111-4111-8111-222222222222',
      decision: 'fusionar',
      mergeInto: 'ef222222-2222-4222-8222-222222222222',
      ...decision,
    });

    await expect(proposals.pending()).resolves.toEqual([]);
    const count = await db.execute<{ total: string }>(
      sql`select count(*) as total from establishments.establishments`,
    );
    expect(count.rows[0]?.total).toBe('0');
  });

  it('da las tiendas a menos de un radio de un punto, con su distancia', async () => {
    const save = new DrizzleEstablishmentImportRepository(db);
    // Unos 30 m al norte y unos 300 m al norte.
    await save.save({
      id: 'ef222222-2222-4222-8222-111111111111',
      name: 'Tienda La Esperanza',
      type: 'barrio',
      lat: 4.53417,
      lng: -75.6811,
    });
    await save.save({
      id: 'ef222222-2222-4222-8222-333333333333',
      name: 'Lejos',
      type: 'barrio',
      lat: 4.5366,
      lng: -75.6811,
    });

    await expect(stores.findWithinMeters({ lat: 4.5339, lng: -75.6811 }, 50)).resolves.toEqual([
      {
        id: 'ef222222-2222-4222-8222-111111111111',
        name: 'Tienda La Esperanza',
        distanceM: expect.closeTo(30, -1) as unknown,
      },
    ]);
  });
});
