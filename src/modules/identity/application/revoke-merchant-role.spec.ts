import type { RoleChange } from './account-repository';
import { RevokeMerchantRole } from './revoke-merchant-role';

const now = new Date('2026-11-23T12:00:00Z');

describe('rol de comercio al revocarlo (D3 del grill comercial, #208)', () => {
  it('el comercio vuelve a reportante y el cambio queda en la bitácora como hecho por el sistema', async () => {
    const changes: RoleChange[] = [];
    const revoke = new RevokeMerchantRole({
      accounts: {
        applyRoleChange: (change) => {
          changes.push(change);
          return Promise.resolve();
        },
      },
      clock: { now: () => now },
    });

    await revoke.execute('cuenta-de-dona-rosa');

    expect(changes).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        fromRole: 'comercio',
        toRole: 'reportante',
        changedBy: null,
        note: 'Comercio revocado por un moderador (D3).',
        changedAt: now,
      },
    ]);
  });

  it('H36: cuando el comercio deja su tienda por decisión propia, la bitácora lo dice con su propia nota', async () => {
    const changes: RoleChange[] = [];
    const revoke = new RevokeMerchantRole({
      accounts: {
        applyRoleChange: (change) => {
          changes.push(change);
          return Promise.resolve();
        },
      },
      clock: { now: () => now },
    });

    await revoke.execute('cuenta-de-dona-rosa', 'El comercio dejó su tienda por decisión propia.');

    expect(changes).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        fromRole: 'comercio',
        toRole: 'reportante',
        changedBy: null,
        note: 'El comercio dejó su tienda por decisión propia.',
        changedAt: now,
      },
    ]);
  });
});
