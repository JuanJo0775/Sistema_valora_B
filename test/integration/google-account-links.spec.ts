import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NewAccount } from '../../src/modules/identity/application/account-repository';
import { DrizzleAccountRepository } from '../../src/modules/identity/infrastructure/drizzle-account-repository';
import { DrizzleGoogleAccountLinks } from '../../src/modules/identity/infrastructure/drizzle-google-account-links';
import { DrizzleSessionRepository } from '../../src/modules/identity/infrastructure/drizzle-session-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// ADR-029, fase 2 (#180): el vínculo con Google en la base. Cuentas de prueba: solo existen aquí.
const ana: NewAccount = {
  id: 'c7777777-7777-4777-8777-111111111111',
  email: 'ana@correo.com',
  displayName: 'Ana María',
  passwordHash: 'hash-de-prueba',
  role: 'reportante',
  policyVersion: '2026-11',
  policyAcceptedAt: new Date('2026-11-12T14:00:00Z'),
};
const subject = '109876543210987654321';
const now = new Date('2026-11-21T14:00:00Z');

describe('vínculo con Google en la base (#180)', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let links: DrizzleGoogleAccountLinks;
  let accounts: DrizzleAccountRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    links = new DrizzleGoogleAccountLinks(db);
    accounts = new DrizzleAccountRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.sessions, identity.accounts, identity.role_changes`,
    );
  });

  const openSession = (id: string) =>
    new DrizzleSessionRepository(db).create({
      id,
      tokenHash: id.replace(/-/g, '').padEnd(64, '0'),
      accountId: ana.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date('2026-12-21T14:00:00Z'),
    });
  const openSessions = async () => {
    const result = await db.execute<{ open: number }>(
      sql`select count(*)::int as open from identity.sessions where revoked_at is null`,
    );
    return result.rows[0]?.open;
  };

  it('encuentra la cuenta por correo y dice si ya verificó su correo', async () => {
    await accounts.create(ana);

    await expect(links.findByEmail('ana@correo.com')).resolves.toMatchObject({
      id: ana.id,
      emailVerified: false,
    });
    await expect(links.findBySubject(subject)).resolves.toBeNull();
  });

  it('vincular guarda el sub y verifica el correo; la cuenta conserva contraseña y sesiones', async () => {
    await accounts.create(ana);
    await openSession('c8888888-8888-4888-8888-111111111111');

    await links.link({ accountId: ana.id, subject, verifiedAt: now, forgetPassword: false });

    await expect(links.findBySubject(subject)).resolves.toMatchObject({
      id: ana.id,
      passwordHash: 'hash-de-prueba',
    });
    await expect(links.findByEmail('ana@correo.com')).resolves.toMatchObject({
      emailVerified: true,
    });
    expect(await openSessions()).toBe(1);
  });

  it('con forgetPassword borra la contraseña y cierra las sesiones abiertas, en la misma operación', async () => {
    await accounts.create(ana);
    await openSession('c8888888-8888-4888-8888-111111111111');
    await openSession('c8888888-8888-4888-8888-222222222222');

    await links.link({ accountId: ana.id, subject, verifiedAt: now, forgetPassword: true });

    await expect(links.findBySubject(subject)).resolves.toMatchObject({ passwordHash: null });
    expect(await openSessions()).toBe(0);
  });

  it('un mismo sub de Google no se puede vincular a dos cuentas', async () => {
    await accounts.create(ana);
    await accounts.create({ ...ana, id: 'c7777777-7777-4777-8777-222222222222', email: 'b@co.co' });
    await links.link({ accountId: ana.id, subject, verifiedAt: now, forgetPassword: false });

    await expect(
      links.link({
        accountId: 'c7777777-7777-4777-8777-222222222222',
        subject,
        verifiedAt: now,
        forgetPassword: false,
      }),
    ).rejects.toThrow();
  });
});
