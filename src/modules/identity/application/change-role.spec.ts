import type { Account, RoleChange } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
import {
  AccountNotFoundError,
  ChangeRole,
  InvalidRoleNoteError,
  OwnRoleError,
  RoleUnchangedError,
  TooManyAttemptsError,
} from './change-role';

const now = new Date('2026-11-14T14:00:00Z');
const note = 'Se une al equipo de moderación';
const moderatorId = '99999999-9999-4999-8999-999999999999';

const account = (email: string, role: Account['role']): Account => ({
  id: `${email}-id`,
  email,
  passwordHash: 'hash',
  role,
  suspendedUntil: null,
  deletionScheduledFor: null,
  emailVerifiedAt: null,
});

// Doble del límite: registra las claves y bloquea las indicadas.
class FakeLimiter implements AttemptLimiter {
  readonly recorded: string[] = [];

  constructor(private readonly blocked: Record<string, number> = {}) {}

  retryAfterSeconds(key: string): number | null {
    return this.blocked[key] ?? null;
  }

  record(key: string): void {
    this.recorded.push(key);
  }

  reset(): void {
    return;
  }
}

function setup(stored: Account[], limiter = new FakeLimiter()) {
  const changes: RoleChange[] = [];
  const changeRole = new ChangeRole({
    accounts: {
      findByEmail: (email) => Promise.resolve(stored.find((seen) => seen.email === email) ?? null),
      applyRoleChange: (change) => {
        changes.push(change);
        return Promise.resolve();
      },
    },
    limiter,
    clock: { now: () => now },
  });
  return { changes, changeRole };
}

describe('cambiar el rol de una cuenta (RF-002 RN1 y RN4)', () => {
  it('un moderador vuelve moderadora a una reportante y queda anotado quién, qué, cuándo y por qué', async () => {
    const ana = account('ana@correo.com', 'reportante');
    const { changes, changeRole } = setup([ana]);

    await changeRole.execute({
      email: 'Ana@Correo.com',
      role: 'moderador',
      note,
      changedBy: moderatorId,
    });

    expect(changes).toEqual([
      {
        accountId: ana.id,
        fromRole: 'reportante',
        toRole: 'moderador',
        changedBy: moderatorId,
        note,
        changedAt: now,
      },
    ]);
  });

  it('un moderador devuelve a reportante a otro moderador', async () => {
    const beto = account('beto@correo.com', 'moderador');
    const { changes, changeRole } = setup([beto]);

    await changeRole.execute({
      email: beto.email,
      role: 'reportante',
      note: 'Deja el equipo de moderación',
      changedBy: moderatorId,
    });

    expect(changes).toMatchObject([
      { accountId: beto.id, fromRole: 'moderador', toRole: 'reportante' },
    ]);
  });

  // Grill de la #73, pregunta 4: el administrador del sistema, por el comando identity:set-role.
  it('el sistema también cambia roles, y queda anotado sin autor', async () => {
    const ana = account('ana@correo.com', 'reportante');
    const { changes, changeRole } = setup([ana]);

    await changeRole.execute({ email: ana.email, role: 'moderador', note, changedBy: null });

    expect(changes).toMatchObject([{ accountId: ana.id, changedBy: null, toRole: 'moderador' }]);
  });

  describe('lo que no se permite (grill de la #73, pregunta 1)', () => {
    it('un moderador no cambia su propio rol', async () => {
      const own = { ...account('mod@correo.com', 'moderador'), id: moderatorId };
      const { changes, changeRole } = setup([own]);

      await expect(
        changeRole.execute({ email: own.email, role: 'reportante', note, changedBy: moderatorId }),
      ).rejects.toThrow(OwnRoleError);
      expect(changes).toEqual([]);
    });

    it('pedir el rol que la cuenta ya tiene no cambia ni anota nada', async () => {
      const ana = account('ana@correo.com', 'reportante');
      const { changes, changeRole } = setup([ana]);

      await expect(
        changeRole.execute({ email: ana.email, role: 'reportante', note, changedBy: moderatorId }),
      ).rejects.toThrow(RoleUnchangedError);
      expect(changes).toEqual([]);
    });

    it.each(['', '   ', 'Corto'])(
      'sin un motivo de 10 caracteres ("%s") no se cambia',
      async (short) => {
        const ana = account('ana@correo.com', 'reportante');
        const { changes, changeRole } = setup([ana]);

        await expect(
          changeRole.execute({ email: ana.email, role: 'moderador', note: short, changedBy: null }),
        ).rejects.toThrow(InvalidRoleNoteError);
        expect(changes).toEqual([]);
      },
    );

    it('un correo que ninguna cuenta tiene no existe', async () => {
      const { changes, changeRole } = setup([]);

      await expect(
        changeRole.execute({ email: 'nadie@correo.com', role: 'moderador', note, changedBy: null }),
      ).rejects.toThrow(AccountNotFoundError);
      expect(changes).toEqual([]);
    });
  });

  // Grill de la #73, pregunta 2: que la ruta no sirva para averiguar correos.
  describe('límite por moderador', () => {
    it('cada intento de un moderador cuenta para su límite', async () => {
      const limiter = new FakeLimiter();
      const { changeRole } = setup([], limiter);

      await expect(
        changeRole.execute({
          email: 'nadie@correo.com',
          role: 'moderador',
          note,
          changedBy: moderatorId,
        }),
      ).rejects.toThrow(AccountNotFoundError);

      expect(limiter.recorded).toEqual([`cambio-de-rol:${moderatorId}`]);
    });

    it('al pasar el límite responde con los segundos que faltan, sin buscar la cuenta', async () => {
      const ana = account('ana@correo.com', 'reportante');
      const { changes, changeRole } = setup(
        [ana],
        new FakeLimiter({ [`cambio-de-rol:${moderatorId}`]: 300 }),
      );

      const attempt = changeRole.execute({
        email: ana.email,
        role: 'moderador',
        note,
        changedBy: moderatorId,
      });

      await expect(attempt).rejects.toThrow(TooManyAttemptsError);
      await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 300 });
      expect(changes).toEqual([]);
    });

    it('el sistema no tiene límite', async () => {
      const limiter = new FakeLimiter();
      const { changeRole } = setup([account('ana@correo.com', 'reportante')], limiter);

      await changeRole.execute({
        email: 'ana@correo.com',
        role: 'moderador',
        note,
        changedBy: null,
      });

      expect(limiter.recorded).toEqual([]);
    });
  });
});
