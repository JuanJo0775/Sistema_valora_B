import type { SuspensionReason } from './account-repository';
import type { Clock } from './clock';

export interface SuspendReporterPorts {
  accounts: {
    byReporterKey(reporterKey: string): Promise<{ id: string; suspendedUntil: Date | null } | null>;
    suspend(accountId: string, until: Date, reason: SuspensionReason): Promise<void>;
  };
  sessions: { revokeAllOf(accountId: string, at: Date): Promise<void> };
  clock: Clock;
}

export interface SuspensionRequest {
  reporterKey: string;
  suspendedUntil: Date;
  // H33: la causa ya traducida al conjunto estable que ve la cuenta.
  reason: Exclude<SuspensionReason, 'no_registrada'>;
}

// Grill de la #33, preguntas 2 a 4: reliability pide suspender a un autor que solo conoce por su
// clave seudónima. La suspensión revoca todas las sesiones y nunca se acorta; la causa que se guarda es la de la suspensión que
// fija la fecha vigente.
export class SuspendReporter {
  constructor(private readonly ports: SuspendReporterPorts) {}

  async execute(request: SuspensionRequest): Promise<void> {
    const { accounts, sessions, clock } = this.ports;
    const account = await accounts.byReporterKey(request.reporterKey);
    if (!account) return;
    const current = account.suspendedUntil;
    if (!current || request.suspendedUntil > current) {
      await accounts.suspend(account.id, request.suspendedUntil, request.reason);
    }
    await sessions.revokeAllOf(account.id, clock.now());
  }
}
