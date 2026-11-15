import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Observation } from '../../src/modules/reliability/application/stores';
import { DrizzleModerationStore } from '../../src/modules/reliability/infrastructure/drizzle-moderation-store';
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
      sql`truncate reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log`,
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

  // Grill de la #32, preguntas 3 y 5.
  it('una cuenta marca un reporte una sola vez y el marcado queda pendiente en la cola', async () => {
    const observations = new DrizzleObservationStore(db);
    const moderation = new DrizzleModerationStore(db);
    const normal = {
      ...observation,
      verdict: { status: 'normal' as const, median: 4500, deviation: 0, references: 3 },
    };
    await observations.save(normal);
    const flag = {
      reportId: normal.reportId,
      flaggerKey: 'b'.repeat(64),
      reason: 'precio_falso' as const,
      createdAt: new Date(),
    };

    await expect(moderation.flag(flag)).resolves.toBe(true);
    await expect(moderation.flag(flag)).resolves.toBe(false);

    await expect(moderation.pending()).resolves.toEqual([{ observation: normal, flags: 1 }]);
  });

  it('una decisión cambia el estado de la observación, sale de la cola y la bitácora no se puede modificar', async () => {
    const observations = new DrizzleObservationStore(db);
    const moderation = new DrizzleModerationStore(db);
    await observations.save(observation);
    expect(await moderation.pending()).toEqual([{ observation, flags: 0 }]);

    await moderation.decide({
      reportId: observation.reportId,
      decision: 'descartar',
      note: 'Precio imposible para esta tienda.',
      moderatorKey: 'c'.repeat(64),
      decidedAt: new Date('2026-11-15T10:00:00Z'),
    });

    await expect(moderation.pending()).resolves.toEqual([]);
    await expect(
      observations.forPresentation(observation.presentationId, [observation.establishmentId]),
    ).resolves.toEqual([{ ...observation, moderation: 'descartado' }]);
    await expect(
      db.execute(sql`update reliability.moderation_log set note = 'otro'`),
    ).rejects.toThrow();
    await expect(db.execute(sql`delete from reliability.moderation_log`)).rejects.toThrow();
  });
});
