import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Observation } from '../../src/modules/reliability/application/stores';
import {
  DrizzleObservationStore,
  DrizzleReputationStore,
} from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Observación de prueba: solo existe dentro de esta prueba.
const observation: Observation = {
  reportId: 'd7777777-7777-4777-8777-111111111111',
  presentationId: 'd7777777-7777-4777-8777-aaaaaaaaaaaa',
  establishmentId: 'd8888888-8888-4888-8888-111111111111',
  reporterKey: 'a'.repeat(64),
  reporterSince: new Date('2026-11-10T00:00:00Z'),
  priceCop: 4500,
  priceType: 'normal',
  observedAt: new Date('2026-11-14T13:00:00Z'),
  receivedAt: new Date('2026-11-14T13:00:02Z'),
  verdict: { status: 'sospechoso', reason: 'rango', median: 9000, deviation: 0.5, references: 3 },
};

describe('repositorios de reliability', () => {
  let pool: Pool;
  let db: NodePgDatabase;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate reliability.observations, reliability.reputations, reliability.reputation_events`,
    );
  });

  it('guarda una observación con su veredicto y la encuentra por presentación y tiendas', async () => {
    const observations = new DrizzleObservationStore(db);

    await observations.save(observation);

    await expect(
      observations.forPresentation(observation.presentationId, [observation.establishmentId]),
    ).resolves.toEqual([observation]);
    await expect(
      observations.forPresentation(observation.presentationId, [
        'd8888888-8888-4888-8888-999999999999',
      ]),
    ).resolves.toEqual([]);
  });

  it('guarda la reputación de una clave y un reporte da su punto una sola vez', async () => {
    const reputations = new DrizzleReputationStore(db);

    await reputations.save(observation.reporterKey, 0.55);
    await reputations.save(observation.reporterKey, 0.6);

    await expect(reputations.valuesOf([observation.reporterKey, 'b'.repeat(64)])).resolves.toEqual(
      new Map([[observation.reporterKey, 0.6]]),
    );
    await expect(
      reputations.claimPoint(observation.reportId, observation.reporterKey),
    ).resolves.toBe(true);
    await expect(
      reputations.claimPoint(observation.reportId, observation.reporterKey),
    ).resolves.toBe(false);
  });
});
