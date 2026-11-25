import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { MerchantClaim } from '../../src/modules/commerce/application/merchant-claims';
import { DrizzleMerchantDepartures } from '../../src/modules/commerce/infrastructure/drizzle-merchant-departures';
import { DrizzleMerchantCaseRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-case-repository';
import { DrizzleMerchantClaimRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-claim-repository';
import { DrizzleMerchantRevocations } from '../../src/modules/commerce/infrastructure/drizzle-merchant-revocations';
import { DrizzleOfficialPriceRepository } from '../../src/modules/commerce/infrastructure/drizzle-official-price-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { createEvent, OutboxPublisher } from '../../src/shared/events';

const STORE = 'cb111111-1111-4111-8111-111111111111';
const claim: MerchantClaim = {
  accountId: 'cb222222-2222-4222-8222-222222222222',
  establishmentId: STORE,
  responsibleName: 'Rosa Gómez',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};
const revokedAt = new Date('2026-11-23T12:00:00Z');

// D3 y ADR-032 (#208): revocar y borrar la cuenta de un comercio, cada uno en una transacción.
describe('revocar un comercio y borrar su cuenta en la base (#208)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let claims: DrizzleMerchantClaimRepository;
  let cases: DrizzleMerchantCaseRepository;
  let prices: DrizzleOfficialPriceRepository;
  let revocations: DrizzleMerchantRevocations;
  const count = async (table: string) =>
    Number(
      (await db.execute<{ total: string }>(sql.raw(`select count(*) as total from ${table}`)))
        .rows[0]?.total,
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
    prices = new DrizzleOfficialPriceRepository(db, outbox);
    revocations = new DrizzleMerchantRevocations(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.official_prices, commerce.promotions, shared.outbox`,
    );
    await claims.save(claim, []);
    await prices.save(
      {
        establishmentId: STORE,
        presentationId: 'cb333333-3333-4333-8333-333333333333',
        priceCop: 2600,
        confirmedAt: revokedAt,
      },
      [],
    );
    await cases.open({
      id: 'cb444444-4444-4444-8444-444444444444',
      establishmentId: STORE,
      kind: 'denuncia',
      reporterKey: 'b'.repeat(64),
      reason: 'El dueño real es don Luis.',
      createdAt: revokedAt,
    });
  });

  it('revocar: la solicitud pasa al historial, se borra lo publicado y se cierran los casos', async () => {
    await revocations.revoke(
      {
        accountId: claim.accountId,
        establishmentId: STORE,
        reason: 'Confirmado con el dueño real: suplantación',
        moderatorKey: 'c'.repeat(64),
        revokedAt,
      },
      [createEvent('MerchantRevoked', 1, {})],
    );

    await expect(claims.findByAccount(claim.accountId)).resolves.toBeNull();
    await expect(claims.lastRejection(claim.accountId)).resolves.toMatchObject({
      outcome: 'revocado',
      reason: 'Confirmado con el dueño real: suplantación',
    });
    await expect(claims.wasRevokedFrom(claim.accountId, STORE)).resolves.toBe(true);
    await expect(prices.listFor(STORE)).resolves.toEqual([]);
    await expect(cases.findPending('cb444444-4444-4444-8444-444444444444')).resolves.toBeNull();
    await expect(count('shared.outbox')).resolves.toBe(1);
  });

  it('borrar la cuenta: no queda su solicitud, su historial ni lo que publicó', async () => {
    await claims.reject({
      accountId: claim.accountId,
      establishmentId: 'cb555555-5555-4555-8555-555555555555',
      reason: 'Una propuesta anterior rechazada',
      rejectedAt: revokedAt,
    });

    await revocations.purge(claim.accountId, STORE, [createEvent('OfficialPriceWithdrawn', 1, {})]);

    await expect(count('commerce.merchant_claims')).resolves.toBe(0);
    await expect(count('commerce.merchant_claim_rejections')).resolves.toBe(0);
    await expect(count('commerce.official_prices')).resolves.toBe(0);
    await expect(count('shared.outbox')).resolves.toBe(1);
  });

  // H36: dejar o eliminar la tienda por decisión propia.
  describe('dejar la tienda por decisión propia (H36)', () => {
    const departure = {
      accountId: claim.accountId,
      establishmentId: STORE,
      kind: 'dejada' as const,
      departedAt: revokedAt,
    };
    let departures: DrizzleMerchantDepartures;

    beforeAll(() => {
      departures = new DrizzleMerchantDepartures(db, new OutboxPublisher());
    });

    it('la solicitud se borra sin historial de revocación, se retira lo publicado y se cierran los casos', async () => {
      await expect(
        departures.depart(departure, [createEvent('MerchantLeft', 1, {})]),
      ).resolves.toBe(true);

      await expect(claims.findByAccount(claim.accountId)).resolves.toBeNull();
      // A diferencia de la revocación, no queda un rechazo que impida volver a reclamar.
      await expect(claims.lastRejection(claim.accountId)).resolves.toBeNull();
      await expect(claims.wasRevokedFrom(claim.accountId, STORE)).resolves.toBe(false);
      await expect(prices.listFor(STORE)).resolves.toEqual([]);
      await expect(cases.findPending('cb444444-4444-4444-8444-444444444444')).resolves.toBeNull();
      await expect(count('shared.outbox')).resolves.toBe(1);
    });

    it('si la solicitud ya no está, no publica nada y devuelve false', async () => {
      await departures.depart(departure, [createEvent('MerchantLeft', 1, {})]);

      await expect(
        departures.depart(departure, [createEvent('MerchantLeft', 1, {})]),
      ).resolves.toBe(false);
      await expect(count('shared.outbox')).resolves.toBe(1);
    });

    it('el reclamo de una tienda nueva guarda que la cuenta la creó', async () => {
      await db.execute(sql`truncate commerce.merchant_claims`);
      await claims.save({ ...claim, createdEstablishment: true }, []);

      await expect(claims.findByAccount(claim.accountId)).resolves.toMatchObject({
        createdEstablishment: true,
      });
      await claims.verify(claim.accountId, STORE, revokedAt, []);
      await expect(claims.findByAccount(claim.accountId)).resolves.toMatchObject({
        createdEstablishment: true,
      });
    });

    it('si la propuesta se fusiona con otra tienda, la cuenta ya no figura como su creadora', async () => {
      await db.execute(sql`truncate commerce.merchant_claims`);
      await claims.save({ ...claim, createdEstablishment: true }, []);

      await claims.verify(claim.accountId, 'cb555555-5555-4555-8555-555555555555', revokedAt, []);

      await expect(claims.findByAccount(claim.accountId)).resolves.toMatchObject({
        establishmentId: 'cb555555-5555-4555-8555-555555555555',
        createdEstablishment: false,
      });
    });
  });
});
