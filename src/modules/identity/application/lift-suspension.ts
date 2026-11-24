export interface LiftSuspensionPorts {
  accounts: {
    byReporterKey(reporterKey: string): Promise<{ id: string; suspendedUntil: Date | null } | null>;
    suspend(accountId: string, until: Date | null, reason: null): Promise<void>;
  };
}

export interface LiftRequest {
  reporterKey: string;
  // La fecha de fin que habría causado el descarte revertido.
  suspendedUntil: Date;
}

// Grill de la #71, pregunta 4: al aceptar una apelación, la suspensión de ese descarte se levanta.
// Solo si la fecha coincide: una suspensión posterior por otra causa no se toca.
export class LiftSuspension {
  constructor(private readonly ports: LiftSuspensionPorts) {}

  async execute(request: LiftRequest): Promise<void> {
    const account = await this.ports.accounts.byReporterKey(request.reporterKey);
    if (account?.suspendedUntil?.getTime() !== request.suspendedUntil.getTime()) return;
    await this.ports.accounts.suspend(account.id, null, null);
  }
}
