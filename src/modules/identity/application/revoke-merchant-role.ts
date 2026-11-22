import type { AccountRepository } from './account-repository';
import type { Clock } from './clock';

export interface RevokeMerchantRolePorts {
  accounts: Pick<AccountRepository, 'applyRoleChange'>;
  clock: Clock;
}

// D3 del grill comercial (#208): al revocar un comercio, commerce avisa MerchantRevoked y la cuenta
// vuelve a reportante. El moderador puede suspenderla después con las reglas existentes.
export class RevokeMerchantRole {
  constructor(private readonly ports: RevokeMerchantRolePorts) {}

  async execute(accountId: string): Promise<void> {
    await this.ports.accounts.applyRoleChange({
      accountId,
      fromRole: 'comercio',
      toRole: 'reportante',
      changedBy: null,
      note: 'Comercio revocado por un moderador (D3).',
      changedAt: this.ports.clock.now(),
    });
  }
}
