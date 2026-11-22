import type { RoleChange } from './account-repository';
import { GrantMerchantRole } from './grant-merchant-role';

const now = new Date('2026-11-21T15:00:00Z');

describe('rol de comercio al verificar una tienda (RF-002 RN1, D3 del grill comercial)', () => {
  it('el reportante pasa a comercio y el cambio queda en la bitácora como hecho por el sistema', async () => {
    const changes: RoleChange[] = [];
    const grant = new GrantMerchantRole({
      accounts: {
        applyRoleChange: (change) => {
          changes.push(change);
          return Promise.resolve();
        },
      },
      clock: { now: () => now },
    });

    await grant.execute('cuenta-de-dona-rosa');

    expect(changes).toEqual([
      {
        accountId: 'cuenta-de-dona-rosa',
        fromRole: 'reportante',
        toRole: 'comercio',
        changedBy: null,
        note: 'Comercio verificado al registrar su tienda (RF-015).',
        changedAt: now,
      },
    ]);
  });
});
