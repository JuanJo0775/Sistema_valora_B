import type { Account, RoleChange } from './account-repository';
import { ChangeRole } from './change-role';

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
});
