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
    cases = new DrizzleMerchantCaseRepository(db, outbox);
    prices = new DrizzleOfficialPriceRepository(db, outbox);
    revocations = new DrizzleMerchantRevocations(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate commerce.merchant_claims, commerce.merchant_claim_rejections, commerce.merchant_cases, commerce.dispute_challengers, commerce.official_prices, commerce.promotions, shared.outbox`,
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
    await cases.open(
      {
        id: 'cb444444-4444-4444-8444-444444444444',
        establishmentId: STORE,
        kind: 'denuncia',
        reporterKey: 'b'.repeat(64),
        reason: 'El dueño real es don Luis.',
        createdAt: revokedAt,
      },
      undefined,
      [],
    );
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

  // H18: los datos de quien disputa solo viven mientras el caso está pendiente.
  const challenger = {
    accountId: 'cb666666-6666-4666-8666-666666666666',
    responsibleName: 'Luis Ramírez',
    nit: null,
    phone: '3157654321',
  };
  const dispute = {
    id: 'cb777777-7777-4777-8777-777777777777',
    establishmentId: STORE,
    kind: 'disputa' as const,
    reporterKey: 'd'.repeat(64),
    reason: 'Otra cuenta, estando en la tienda, intentó registrarla.',
    createdAt: revokedAt,
  };

  // #260: el evento para avisar a moderación se guarda con el caso y con quien disputa, juntos.
  it('el caso, quien disputa y su evento se guardan juntos, y si algo falla no queda ninguno', async () => {
    const event = createEvent('MerchantCaseOpened', 1, { caseId: dispute.id, kind: 'disputa' });

    await cases.open(dispute, challenger, [event]);
    await expect(cases.open(dispute, challenger, [createEvent('X', 1, {})])).rejects.toThrow();

    const saved = await db.execute(sql`select type, payload from shared.outbox`);
    expect(saved.rows).toEqual([
      { type: 'MerchantCaseOpened', payload: { caseId: dispute.id, kind: 'disputa' } },
    ]);
  });

  it('la disputa pendiente trae a quien disputa, sin su cuenta; las demás, null', async () => {
    await cases.open(dispute, challenger, []);

    const pending = await cases.pending();

    expect(pending.find((found) => found.id === dispute.id)?.challenger).toEqual({
      responsibleName: 'Luis Ramírez',
      nit: null,
      phone: '3157654321',
    });
    expect(pending.find((found) => found.kind === 'denuncia')).not.toHaveProperty('challenger');
    expect(JSON.stringify(pending)).not.toContain(challenger.accountId);
  });

  it('descartar la disputa borra los datos de quien disputó', async () => {
    await cases.open(dispute, challenger, []);

    await cases.close({
      caseId: dispute.id,
      status: 'descartado',
      note: 'El dueño actual es el correcto',
      moderatorKey: 'c'.repeat(64),
      decidedAt: revokedAt,
    });

    await expect(count('commerce.dispute_challengers')).resolves.toBe(0);
  });

  it('revocar borra los datos de quienes disputaban esa tienda', async () => {
    await cases.open(dispute, challenger, []);

    await revocations.revoke(
      {
        accountId: claim.accountId,
        establishmentId: STORE,
        reason: 'Confirmado con el dueño real: suplantación',
        moderatorKey: 'c'.repeat(64),
        revokedAt,
      },
      [],
    );

    await expect(count('commerce.dispute_challengers')).resolves.toBe(0);
  });

  it('borrar la cuenta de quien disputó borra sus datos, aunque el caso siga pendiente', async () => {
    await cases.open(dispute, challenger, []);

    await revocations.purge(challenger.accountId, null, []);

    await expect(count('commerce.dispute_challengers')).resolves.toBe(0);
    await expect(cases.findPending(dispute.id)).resolves.not.toBeNull();
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

    // H18: los datos de quien disputa solo viven mientras su caso está pendiente.
    it('borra los datos de quienes disputaban la tienda, porque sus casos se cierran', async () => {
      await db.execute(sql`truncate commerce.dispute_challengers`);
      await db.execute(
        sql`insert into commerce.dispute_challengers (case_id, establishment_id, account_id, responsible_name, phone)
            values ('cb777777-7777-4777-8777-777777777777', ${STORE}, 'cb666666-6666-4666-8666-666666666666', 'Luis Ramírez', '3157654321')`,
      );

      await departures.depart(departure, []);

      await expect(count('commerce.dispute_challengers')).resolves.toBe(0);
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

      const merged = await claims.findByAccount(claim.accountId);
      expect(merged).toMatchObject({ establishmentId: 'cb555555-5555-4555-8555-555555555555' });
      expect(merged).not.toHaveProperty('createdEstablishment');
    });
  });
});
