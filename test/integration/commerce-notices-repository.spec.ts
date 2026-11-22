import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { MerchantClaim } from '../../src/modules/commerce/application/merchant-claims';
import { DrizzleMerchantClaimRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-claim-repository';
import { DrizzleMerchantNotices } from '../../src/modules/commerce/infrastructure/drizzle-merchant-notices';
import { DrizzleMerchantRevocations } from '../../src/modules/commerce/infrastructure/drizzle-merchant-revocations';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';
import { OutboxPublisher } from '../../src/shared/events';

const rosa = 'cd111111-1111-4111-8111-111111111111';
const luis = 'cd222222-2222-4222-8222-222222222222';
const claim = (accountId: string, establishmentId: string, status: MerchantClaim['status']) => ({
  accountId,
  establishmentId,
  responsibleName: 'Responsable',
  nit: null,
  informal: true,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status,
  verifiedAt: status === 'verificado' ? new Date('2026-11-21T15:00:00Z') : null,
});

// B9 (#209): lo ya avisado por correo a cada comercio, para no repetirlo.
describe('avisos enviados a los comercios en la base (#209)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let notices: DrizzleMerchantNotices;
  let claims: DrizzleMerchantClaimRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    notices = new DrizzleMerchantNotices(db);
    claims = new DrizzleMerchantClaimRepository(db, new OutboxPublisher());
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate commerce.merchant_claims, commerce.merchant_notices`);
  });

  it('solo los comercios verificados reciben el resumen', async () => {
    await claims.save(claim(rosa, 'cd333333-3333-4333-8333-333333333333', 'verificado'), []);
    await claims.save(claim(luis, 'cd444444-4444-4444-8444-444444444444', 'pre_aprobado'), []);

    await expect(notices.verifiedAccounts()).resolves.toEqual([rosa]);
  });

  it('recuerda lo avisado y el día del correo; repetir el registro no duplica', async () => {
    await notices.record(rosa, '2026-11-22', ['vence_pronto:arroz:x', 'discrepancia:panela:y']);
    await notices.record(rosa, '2026-11-22', ['vence_pronto:arroz:x']);

    await expect(notices.knownKeys(rosa)).resolves.toEqual(
      new Set(['vence_pronto:arroz:x', 'discrepancia:panela:y']),
    );
    await expect(notices.sentOn(rosa, '2026-11-22')).resolves.toBe(true);
    await expect(notices.sentOn(rosa, '2026-11-23')).resolves.toBe(false);
    await expect(notices.knownKeys(luis)).resolves.toEqual(new Set());
  });

  // ADR-032 (#208): al borrar la cuenta tampoco queda lo que se le avisó.
  it('borrar la cuenta borra sus avisos', async () => {
    await notices.record(rosa, '2026-11-22', ['vence_pronto:arroz:x']);

    await new DrizzleMerchantRevocations(db, new OutboxPublisher()).purge(rosa, null, []);

    await expect(notices.knownKeys(rosa)).resolves.toEqual(new Set());
  });
});
