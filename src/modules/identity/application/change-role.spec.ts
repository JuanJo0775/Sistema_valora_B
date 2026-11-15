import type { Account, RoleChange } from './account-repository';
import {
  AccountNotFoundError,
  ChangeRole,
  InvalidRoleNoteError,
  OwnRoleError,
  RoleUnchangedError,
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
});

function setup(stored: Account[]) {
  const changes: RoleChange[] = [];
  const changeRole = new ChangeRole({
    accounts: {
      findByEmail: (email) => Promise.resolve(stored.find((seen) => seen.email === email) ?? null),
      applyRoleChange: (change) => {
        changes.push(change);
        return Promise.resolve();
      },
    },
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
});
