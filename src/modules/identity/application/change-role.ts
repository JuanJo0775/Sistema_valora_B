import type { AccountRepository, Role } from './account-repository';
import type { Clock } from './clock';
import { normalizeEmail } from './register-account';

export interface ChangeRolePorts {
  accounts: Pick<AccountRepository, 'findByEmail' | 'applyRoleChange'>;
  clock: Clock;
}

export interface ChangeRoleRequest {
  email: string;
  role: Role;
  note: string;
  // Cuenta del moderador que lo pide, o null si es el sistema (comando identity:set-role).
  changedBy: string | null;
}

// RF-002 RN1 y RN4 (grill de la #73): un moderador o el sistema cambia el rol de una cuenta, y el
// cambio queda en la bitácora.
export class ChangeRole {
  constructor(private readonly ports: ChangeRolePorts) {}

  async execute(request: ChangeRoleRequest): Promise<void> {
    const { accounts, clock } = this.ports;
    const account = await accounts.findByEmail(normalizeEmail(request.email));
    if (!account) return;
    await accounts.applyRoleChange({
      accountId: account.id,
      fromRole: account.role,
      toRole: request.role,
      changedBy: request.changedBy,
      note: request.note,
      changedAt: clock.now(),
    });
  }
}
