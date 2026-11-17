import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../../src/app.module';
import type { Observation } from '../../src/modules/reliability/application/stores';
import { DrizzleModerationStore } from '../../src/modules/reliability/infrastructure/drizzle-moderation-store';
import { DrizzleObservationStore } from '../../src/modules/reliability/infrastructure/drizzle-stores';
import { DATABASE, type Database } from '../../src/shared/database/database.module';
import { createEvent, OutboxPublisher, OutboxRelay } from '../../src/shared/events';

const observation = (reportId: string): Observation => ({
  reportId,
  presentationId: 'e8888888-8888-4888-8888-888888888888',
  establishmentId: 'e9999999-9999-4999-8999-999999999999',
  reporterKey: 'a'.repeat(64),
  reporterSince: new Date('2026-01-01T00:00:00Z'),
  priceCop: 3000,
  priceType: 'normal',
  observedAt: new Date('2026-11-15T13:00:00Z'),
  receivedAt: new Date('2026-11-15T13:00:01Z'),
  verdict: { status: 'normal', median: 3000, deviation: 0, references: 3 },
});

describe('ráfaga avisada por pricing (RF-012 RN2, grill de la #29)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate reliability.observations, reliability.bursts, reliability.flags, reliability.moderation_log, reliability.appeals, shared.outbox, shared.processed_events`,
    );
  });

  it('ReportBurstDetected pone los reportes de la ráfaga en la cola', async () => {
    const ids = ['ea111111-1111-4111-8111-111111111111', 'ea111111-1111-4111-8111-222222222222'];
    for (const id of ids) await new DrizzleObservationStore(db).save(observation(id));

    const event = createEvent('ReportBurstDetected', 1, {
      reporterKey: 'a'.repeat(64),
      reportIds: ids,
    });
    await db.transaction((tx) => app.get(OutboxPublisher).publish(tx, event));
    await app.get(OutboxRelay).runOnce();

    const pending = await new DrizzleModerationStore(db).pending();
    expect(pending.map((item) => [item.observation.reportId, item.burst]).sort()).toEqual(
      ids.map((id) => [id, true]).sort(),
    );
  });
});
