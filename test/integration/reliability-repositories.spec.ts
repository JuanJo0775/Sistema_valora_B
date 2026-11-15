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
      sql`truncate reliability.observations, reliability.reputations, reliability.reputation_events, reliability.flags, reliability.moderation_log, reliability.appeals`,
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

  // Grill de la #32: marcar y decidir necesitan encontrar el reporte por su id.
  it('encuentra una observación por su reporte, o null si no existe', async () => {
    const observations = new DrizzleObservationStore(db);
    await observations.save(observation);

    await expect(observations.byReportId(observation.reportId)).resolves.toEqual(observation);
    await expect(
      observations.byReportId('d7777777-7777-4777-8777-999999999999'),
    ).resolves.toBeNull();
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
      stage: 'revision',
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

  // Grill de la #33, pregunta 5: la racha de RN6 se calcula con las decisiones sobre un autor.
  it('da las decisiones sobre los reportes de un autor, en el orden en que se tomaron', async () => {
    const observations = new DrizzleObservationStore(db);
    const moderation = new DrizzleModerationStore(db);
    const second = { ...observation, reportId: 'd7777777-7777-4777-8777-222222222222' };
    const other = {
      ...observation,
      reportId: 'd7777777-7777-4777-8777-333333333333',
      reporterKey: 'b'.repeat(64),
    };
    for (const seen of [observation, second, other]) await observations.save(seen);
    const entry = (reportId: string, decision: 'aprobar' | 'descartar', minute: number) => ({
      reportId,
      decision,
      note: 'Motivo de la prueba',
      moderatorKey: 'c'.repeat(64),
      decidedAt: new Date(Date.UTC(2026, 10, 14, 14, minute)),
      stage: 'revision' as const,
    });

    await moderation.decide(entry(second.reportId, 'descartar', 2));
    await moderation.decide(entry(other.reportId, 'descartar', 3));
    await moderation.decide(entry(observation.reportId, 'aprobar', 1));

    await expect(moderation.decisionsAbout(observation.reporterKey)).resolves.toEqual([
      'aprobar',
      'descartar',
    ]);
  });

  // Grill de la #71: la apelación de un reporte descartado.
  describe('apelaciones', () => {
    const discardedAt = new Date('2026-11-15T10:00:00Z');
    const discard = {
      reportId: observation.reportId,
      decision: 'descartar' as const,
      note: 'Precio imposible para esta tienda.',
      moderatorKey: 'c'.repeat(64),
      decidedAt: discardedAt,
      stage: 'revision' as const,
    };
    const appeal = {
      reportId: observation.reportId,
      note: 'El precio sí era ese, está en la etiqueta.',
      createdAt: new Date('2026-11-16T10:00:00Z'),
    };

    it('una apelación por reporte; queda pendiente en la cola con el motivo del autor', async () => {
      const moderation = new DrizzleModerationStore(db);
      await new DrizzleObservationStore(db).save(observation);
      await moderation.decide(discard);

      await expect(moderation.appeal(appeal)).resolves.toBe(true);
      await expect(moderation.appeal(appeal)).resolves.toBe(false);

      await expect(moderation.pending()).resolves.toEqual([
        {
          observation: { ...observation, moderation: 'descartado' },
          flags: 0,
          appeal: { note: appeal.note, createdAt: appeal.createdAt },
        },
      ]);
      await expect(moderation.revisionOf(observation.reportId)).resolves.toEqual(discard);
      await expect(moderation.appealOf(observation.reportId)).resolves.toEqual({
        note: appeal.note,
        createdAt: appeal.createdAt,
        outcome: null,
      });
    });

    it('aceptarla deja el reporte aprobado, sale de la cola y el descarte cuenta como aprobar', async () => {
      const moderation = new DrizzleModerationStore(db);
      const observations = new DrizzleObservationStore(db);
      await observations.save(observation);
      await moderation.decide(discard);
      await moderation.appeal(appeal);

      await moderation.decide({
        ...discard,
        decision: 'aprobar',
        moderatorKey: 'd'.repeat(64),
        decidedAt: new Date('2026-11-17T10:00:00Z'),
        stage: 'apelacion',
      });

      await expect(moderation.pending()).resolves.toEqual([]);
      await expect(observations.byReportId(observation.reportId)).resolves.toMatchObject({
        moderation: 'aprobado',
      });
      await expect(moderation.appealOf(observation.reportId)).resolves.toMatchObject({
        outcome: 'aceptada',
      });
      await expect(moderation.decisionsAbout(observation.reporterKey)).resolves.toEqual([
        'aprobar',
      ]);
    });

    it('rechazarla deja el reporte descartado y no suma otro descarte a la racha', async () => {
      const moderation = new DrizzleModerationStore(db);
      const observations = new DrizzleObservationStore(db);
      await observations.save(observation);
      await moderation.decide(discard);
      await moderation.appeal(appeal);

      await moderation.decide({
        ...discard,
        moderatorKey: 'd'.repeat(64),
        decidedAt: new Date('2026-11-17T10:00:00Z'),
        stage: 'apelacion',
      });

      await expect(moderation.pending()).resolves.toEqual([]);
      await expect(observations.byReportId(observation.reportId)).resolves.toMatchObject({
        moderation: 'descartado',
      });
      await expect(moderation.appealOf(observation.reportId)).resolves.toMatchObject({
        outcome: 'rechazada',
      });
      await expect(moderation.decisionsAbout(observation.reporterKey)).resolves.toEqual([
        'descartar',
      ]);
    });
  });
});
