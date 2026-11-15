import { createHmac } from 'node:crypto';

// Grill de la #31, pregunta 2: lo único que otros módulos saben del reportante.
export interface ReporterPseudonym {
  // HMAC-SHA256 del id de la cuenta: estable y no reversible sin el secreto.
  reporterKey: string;
  // Día de creación de la cuenta (AAAA-MM-DD), para saber si es nueva.
  reporterSince: string;
}

export interface AccountCreation {
  createdAtOf(accountId: string): Promise<Date>;
  // Grill de la #33, pregunta 3: guarda la clave para encontrar la cuenta por ella.
  rememberReporterKey(accountId: string, reporterKey: string): Promise<void>;
}

export interface ReporterIdentityPorts {
  accounts: AccountCreation;
  secret: string;
}

export class ReporterIdentity {
  constructor(private readonly ports: ReporterIdentityPorts) {}

  async of(accountId: string): Promise<ReporterPseudonym> {
    const { accounts, secret } = this.ports;
    const createdAt = await accounts.createdAtOf(accountId);
    const reporterKey = createHmac('sha256', secret).update(accountId).digest('hex');
    await accounts.rememberReporterKey(accountId, reporterKey);
    return { reporterKey, reporterSince: createdAt.toISOString().slice(0, 10) };
  }
}
