import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NewReport } from '../../src/modules/pricing/application/report-repository';
import { DrizzleReportRepository } from '../../src/modules/pricing/infrastructure/drizzle-report-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { createEvent, OutboxPublisher } from '../../src/shared/events';

// Reporte de prueba: solo existe dentro de esta prueba.
const report: NewReport = {
  id: 'a1111111-1111-4111-8111-111111111111',
  presentationId: 'a2222222-2222-4222-8222-222222222222',
  establishmentId: 'a3333333-3333-4333-8333-333333333333',
  priceCop: 4500,
  priceType: 'oferta',
  observedAt: new Date('2026-11-12T13:30:00Z'),
  receivedAt: new Date('2026-11-12T14:00:00Z'),
  idempotencyKey: 'a4444444-4444-4444-8444-444444444444',
  requestHash: 'huella-de-prueba',
};
const event = createEvent('PriceReported', 1, { reportId: report.id });

describe('repositorio de reportes de pricing', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let repository: DrizzleReportRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    repository = new DrizzleReportRepository(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate pricing.reports, shared.outbox`);
  });

  it('guarda el reporte y su evento juntos, y lo encuentra por su clave', async () => {
    await expect(repository.save(report, event)).resolves.toEqual({ report, created: true });

    await expect(repository.findByIdempotencyKey(report.idempotencyKey)).resolves.toEqual(report);
    const outbox = await db.execute<{ id: string; type: string }>(
      sql`select id, type from shared.outbox`,
    );
    expect(outbox.rows).toEqual([{ id: event.id, type: 'PriceReported' }]);
  });
});
