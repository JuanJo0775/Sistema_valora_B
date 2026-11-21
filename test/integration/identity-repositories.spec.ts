import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NewAccount } from '../../src/modules/identity/application/account-repository';
import type { NewSession } from '../../src/modules/identity/application/session-repository';
import { DrizzleAccountDeletionRepository } from '../../src/modules/identity/infrastructure/drizzle-account-deletion-repository';
import { DrizzleAccountRepository } from '../../src/modules/identity/infrastructure/drizzle-account-repository';
import { DrizzleSessionRepository } from '../../src/modules/identity/infrastructure/drizzle-session-repository';
import { resolveDatabaseUrl } from '../../src/shared/database/database-url';

// Cuenta y sesión de prueba: solo existen dentro de esta prueba.
const ana: NewAccount = {
  id: 'c5555555-5555-4555-8555-111111111111',
  email: 'ana@correo.com',
  displayName: 'Ana María',
  passwordHash: 'hash-de-prueba',
  role: 'reportante',
  policyVersion: '2026-11',
  policyAcceptedAt: new Date('2026-11-12T14:00:00Z'),
};
const session: NewSession = {
  id: 'c6666666-6666-4666-8666-111111111111',
  tokenHash: 'a'.repeat(64),
  accountId: ana.id,
  createdAt: new Date('2026-11-12T14:00:00Z'),
  lastSeenAt: new Date('2026-11-12T14:00:00Z'),
  expiresAt: new Date('2026-12-12T14:00:00Z'),
};

describe('repositorios de identity', () => {
  let pool: Pool;
  let db: NodePgDatabase;
  let accounts: DrizzleAccountRepository;
  let sessions: DrizzleSessionRepository;

  beforeAll(() => {
    pool = new Pool({
      connectionString: resolveDatabaseUrl({
        NODE_ENV: 'test',
        DATABASE_URL: process.env['DATABASE_URL'] ?? '',
        DATABASE_URL_TEST: process.env['DATABASE_URL_TEST'] ?? '',
      }),
    });
    db = drizzle(pool);
    accounts = new DrizzleAccountRepository(db);
    sessions = new DrizzleSessionRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate identity.email_verifications, identity.sessions, identity.accounts, identity.role_changes`,
    );
  });

  it('guarda una cuenta, la encuentra por correo y no deja repetir el correo', async () => {
    await accounts.create(ana);

    await expect(accounts.findByEmail('ana@correo.com')).resolves.toEqual({
      id: ana.id,
      email: ana.email,
      passwordHash: ana.passwordHash,
      role: 'reportante',
      suspendedUntil: null,
      deletionScheduledFor: null,
    });
    await expect(accounts.findByEmail('nadie@correo.com')).resolves.toBeNull();
    // Dos registros simultáneos con el mismo correo: el segundo no crea nada ni falla.
    await accounts.create({ ...ana, id: 'c5555555-5555-4555-8555-222222222222' });
    const count = await db.execute<{ count: string }>(
      sql`select count(*) as count from identity.accounts`,
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  // ADR-029, fase 2 (#179): las cuentas creadas con Google no tienen contraseña. Se inserta con SQL porque
  // el caso de uso que las crea llega con la #181.
  it('guarda una cuenta sin contraseña y la devuelve con passwordHash null, también en credentialsOf', async () => {
    await accounts.create(ana);
    await db.execute(sql`update identity.accounts set password_hash = null where id = ${ana.id}`);

    await expect(accounts.findByEmail('ana@correo.com')).resolves.toMatchObject({
      id: ana.id,
      passwordHash: null,
    });
    await expect(new DrizzleAccountDeletionRepository(db).credentialsOf(ana.id)).resolves.toEqual({
      email: 'ana@correo.com',
      passwordHash: null,
    });
  });

  it('guarda el nombre visible y lo devuelve solo con displayNameOf (#133)', async () => {
    await accounts.create(ana);

    await expect(accounts.displayNameOf(ana.id)).resolves.toBe('Ana María');
    await expect(
      accounts.displayNameOf('c5555555-5555-4555-8555-999999999999'),
    ).resolves.toBeNull();
    // findByEmail sirve al inicio de sesión: no necesita el nombre.
    expect(await accounts.findByEmail(ana.email)).not.toHaveProperty('displayName');
  });

  it('guarda una sesión, la encuentra por el hash del token con el rol, marca su uso y la revoca', async () => {
    await accounts.create(ana);
    await sessions.create(session);
    const later = new Date('2026-11-12T15:00:00Z');

    await expect(sessions.findByTokenHash(session.tokenHash)).resolves.toEqual({
      ...session,
      revokedAt: null,
      role: 'reportante',
      accountSuspendedUntil: null,
      accountEmailVerifiedAt: null,
    });
    await sessions.touch(session.id, later);
    await sessions.revoke(session.id, later);

    await expect(sessions.findByTokenHash(session.tokenHash)).resolves.toMatchObject({
      lastSeenAt: later,
      revokedAt: later,
    });
    await expect(sessions.findByTokenHash('b'.repeat(64))).resolves.toBeNull();
  });

  // Grill de la #33, pregunta 3.
  it('guarda la clave seudónima de una cuenta y la encuentra por esa clave', async () => {
    await accounts.create(ana);

    await accounts.rememberReporterKey(ana.id, 'f'.repeat(64));
    await accounts.rememberReporterKey(ana.id, 'f'.repeat(64));

    await expect(accounts.byReporterKey('f'.repeat(64))).resolves.toEqual({
      id: ana.id,
      suspendedUntil: null,
    });
    await expect(accounts.byReporterKey('e'.repeat(64))).resolves.toBeNull();
  });

  // Grill de la #33, pregunta 4.
  it('suspende una cuenta hasta una fecha y revoca todas sus sesiones abiertas', async () => {
    await accounts.create(ana);
    await accounts.rememberReporterKey(ana.id, 'f'.repeat(64));
    await sessions.create(session);
    await sessions.create({
      ...session,
      id: 'c6666666-6666-4666-8666-222222222222',
      tokenHash: 'c'.repeat(64),
    });
    const until = new Date('2026-11-21T14:00:00Z');
    const at = new Date('2026-11-14T14:00:00Z');

    await accounts.suspend(ana.id, until);
    await sessions.revokeAllOf(ana.id, at);

    await expect(accounts.byReporterKey('f'.repeat(64))).resolves.toEqual({
      id: ana.id,
      suspendedUntil: until,
    });
    await expect(accounts.byReporterKey('e'.repeat(64))).resolves.toBeNull();
    for (const tokenHash of [session.tokenHash, 'c'.repeat(64)]) {
      await expect(sessions.findByTokenHash(tokenHash)).resolves.toMatchObject({ revokedAt: at });
    }
  });

  // Grill de la #73, pregunta 3: RF-002 RN4.
  it('cambia el rol de una cuenta y lo anota en una bitácora que no se puede modificar', async () => {
    await accounts.create(ana);
    const moderatorId = 'c5555555-5555-4555-8555-999999999999';

    await accounts.applyRoleChange({
      accountId: ana.id,
      fromRole: 'reportante',
      toRole: 'moderador',
      changedBy: moderatorId,
      note: 'Se une al equipo de moderación',
      changedAt: new Date('2026-11-14T14:00:00Z'),
    });

    await expect(accounts.findByEmail(ana.email)).resolves.toMatchObject({ role: 'moderador' });
    const log = await db.execute<{ account_id: string; changed_by: string | null }>(
      sql`select account_id, from_role, to_role, changed_by, note from identity.role_changes`,
    );
    expect(log.rows).toEqual([
      {
        account_id: ana.id,
        from_role: 'reportante',
        to_role: 'moderador',
        changed_by: moderatorId,
        note: 'Se une al equipo de moderación',
      },
    ]);
    await expect(db.execute(sql`update identity.role_changes set note = 'otro'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from identity.role_changes`)).rejects.toThrow();
  });
});
