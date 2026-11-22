import type { AccountRepository } from './account-repository';
import type { Clock } from './clock';

export interface GrantMerchantRolePorts {
  accounts: Pick<AccountRepository, 'applyRoleChange'>;
  clock: Clock;
}

// D3 del grill comercial: commerce lo pide al verificar una tienda. Solo un reportante registra una
// tienda (lo exige la ruta), así que el cambio siempre parte de ese rol.
export class GrantMerchantRole {
  constructor(private readonly ports: GrantMerchantRolePorts) {}

  async execute(accountId: string): Promise<void> {
    await this.ports.accounts.applyRoleChange({
      accountId,
      fromRole: 'reportante',
      toRole: 'comercio',
      changedBy: null,
      note: 'Comercio verificado al registrar su tienda (RF-015).',
      changedAt: this.ports.clock.now(),
    });
  }
}
