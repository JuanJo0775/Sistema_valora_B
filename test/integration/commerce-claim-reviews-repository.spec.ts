import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { MerchantCase } from '../../src/modules/commerce/application/merchant-cases';
import type { MerchantClaim } from '../../src/modules/commerce/application/merchant-claims';
import { DrizzleMerchantCaseRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-case-repository';
import { DrizzleMerchantClaimRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-claim-repository';
import { DrizzleMerchantClaimReviews } from '../../src/modules/commerce/infrastructure/drizzle-merchant-claim-reviews';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { createEvent, OutboxPublisher } from '../../src/shared/events';

const accountId = 'c0111111-1111-4111-8111-111111111111';
const establishmentId = 'c0222222-2222-4222-8222-222222222222';
const pending: MerchantClaim = {
  accountId,
  establishmentId,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'pre_aprobado',
  verifiedAt: null,
};
const reviewCase: MerchantCase = {
  id: 'c0333333-3333-4333-8333-333333333333',
  establishmentId,
  kind: 'reclamo',
  reporterKey: 'clave-de-rosa',
  reason: 'Reclamo de un supermercado: pendiente de revisión.',
  createdAt: new Date('2026-11-24T15:00:00Z'),
};
const decidedAt = new Date('2026-11-24T16:00:00Z');
const review = {
  caseId: reviewCase.id,
  accountId,
  establishmentId,
  note: 'Revisado por la persona moderadora',
  moderatorKey: 'clave-de-la-moderadora',
  decidedAt,
};

// H11 (ADR-037): el reclamo pre-aprobado y su caso se guardan y se deciden de forma atómica.
describe('reclamos de supermercados en el esquema commerce (H11)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let claims: DrizzleMerchantClaimRepository;
  let cases: DrizzleMerchantCaseRepository;
  let reviews: DrizzleMerchantClaimReviews;

  const caseStatus = async () =>
    (
      await db.execute<{ status: string; note: string | null; moderator_key: string | null }>(
        sql`select status, note, moderator_key from commerce.merchant_cases where id = ${reviewCase.id}`,
      )
    ).rows[0];
  const outboxTypes = async () =>
    (await db.execute<{ type: string }>(sql`select type from shared.outbox`)).rows.map(
      (row) => row.type,
    );

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    const outbox = new OutboxPublisher();
    claims = new DrizzleMerchantClaimRepository(db, outbox);
    cases = new DrizzleMerchantCaseRepository(db);
    reviews = new DrizzleMerchantClaimReviews(db, outbox);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, shared.outbox`,
    );
    await claims.save(pending, [], reviewCase);
  });

  it('guardar la solicitud pre-aprobada abre el caso de reclamo pendiente, sin evento', async () => {
    await expect(claims.findByAccount(accountId)).resolves.toEqual(pending);
    await expect(cases.pending()).resolves.toEqual([reviewCase]);
    await expect(outboxTypes()).resolves.toEqual([]);
  });

  it('si la solicitud no se puede guardar, tampoco queda el caso', async () => {
    await db.execute(sql`truncate commerce.merchant_cases`);

    await expect(
      claims.save({ ...pending, accountId: 'c0999999-9999-4999-8999-999999999999' }, [], {
        ...reviewCase,
        id: 'c0444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toThrow();
    await expect(cases.pending()).resolves.toEqual([]);
  });

  it('aprobar deja la solicitud verificada, cierra el caso como aprobado y guarda MerchantVerified', async () => {
    await reviews.approve(review, [createEvent('MerchantVerified', 1, { accountId, establishmentId })]);

    await expect(claims.findByAccount(accountId)).resolves.toEqual({
      ...pending,
      status: 'verificado',
      verifiedAt: decidedAt,
    });
    await expect(caseStatus()).resolves.toEqual({
      status: 'aprobado',
      note: review.note,
      moderator_key: review.moderatorKey,
    });
    await expect(outboxTypes()).resolves.toEqual(['MerchantVerified']);
    await expect(cases.findPending(reviewCase.id)).resolves.toBeNull();
  });

  it('rechazar saca la solicitud de las activas, la deja en el historial y cierra el caso', async () => {
    await reviews.reject(review);

    await expect(claims.findByAccount(accountId)).resolves.toBeNull();
    await expect(claims.lastRejection(accountId)).resolves.toEqual({
      accountId,
      establishmentId,
      reason: review.note,
      rejectedAt: decidedAt,
      outcome: 'rechazado',
    });
    await expect(caseStatus()).resolves.toEqual({
      status: 'rechazado',
      note: review.note,
      moderator_key: review.moderatorKey,
    });
    await expect(outboxTypes()).resolves.toEqual([]);
  });
});
