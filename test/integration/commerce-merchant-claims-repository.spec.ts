import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  AccountHasEstablishmentError,
  EstablishmentHasOwnerError,
} from '../../src/modules/commerce/application/claim-establishment';
import type { MerchantClaim } from '../../src/modules/commerce/application/merchant-claims';
import { DrizzleMerchantClaimRepository } from '../../src/modules/commerce/infrastructure/drizzle-merchant-claim-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

const claim: MerchantClaim = {
  accountId: 'c0111111-1111-4111-8111-111111111111',
  establishmentId: 'c0222222-2222-4222-8222-222222222222',
  responsibleName: 'Rosa Gómez',
  nit: '800.197.268-4',
  informal: false,
  phone: '3001234567',
  acceptedTermsVersion: '2026-11',
  status: 'verificado',
  verifiedAt: new Date('2026-11-21T15:00:00Z'),
};

describe('solicitudes de comercio en el esquema commerce (RF-015, #201)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
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
    claims = new DrizzleMerchantClaimRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate commerce.merchant_claims`);
  });

  it('guarda la solicitud y la encuentra por la cuenta y por la tienda', async () => {
    await claims.save(claim);

    await expect(claims.findByAccount(claim.accountId)).resolves.toEqual(claim);
    await expect(claims.ownerOf(claim.establishmentId)).resolves.toBe(claim.accountId);
    await expect(claims.establishmentOf(claim.accountId)).resolves.toBe(claim.establishmentId);
  });

  it('sin solicitud, la cuenta no tiene tienda y la tienda no tiene dueño', async () => {
    await expect(claims.findByAccount(claim.accountId)).resolves.toBeNull();
    await expect(claims.ownerOf(claim.establishmentId)).resolves.toBeNull();
    await expect(claims.establishmentOf(claim.accountId)).resolves.toBeNull();
  });

  // Dos personas registran la misma tienda al mismo tiempo: la base deja una sola (D3).
  it('una segunda cuenta para la misma tienda se rechaza aunque llegue a la vez', async () => {
    await claims.save(claim);

    await expect(
      claims.save({ ...claim, accountId: 'c0333333-3333-4333-8333-333333333333' }),
    ).rejects.toThrow(EstablishmentHasOwnerError);
  });

  it('una segunda tienda para la misma cuenta se rechaza aunque llegue a la vez', async () => {
    await claims.save(claim);

    await expect(
      claims.save({ ...claim, establishmentId: 'c0444444-4444-4444-8444-444444444444' }),
    ).rejects.toThrow(AccountHasEstablishmentError);
  });
});
