import type {
  EmailVerificationRepository,
  NewEmailVerification,
  StoredEmailVerification,
  VerificationTarget,
} from './email-verification-repository';
import type { EmailMessage, EmailSender } from './email-sender';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Dobles en memoria de los puertos de la verificación de correo, para las pruebas unitarias.
export class InMemoryVerifications implements EmailVerificationRepository {
  readonly rows: StoredEmailVerification[] = [];
  // Cuentas conocidas: id -> correo y cuándo verificó (null: sin verificar).
  readonly accounts = new Map<string, { email: string; verifiedAt: Date | null }>();

  deleteUnusedOf(accountId: string): Promise<void> {
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      const row = this.rows[i];
      if (row?.accountId === accountId && row.usedAt === null) this.rows.splice(i, 1);
    }
    return Promise.resolve();
  }

  create(verification: NewEmailVerification): Promise<void> {
    this.rows.push({ ...verification, usedAt: null });
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: string) {
    const found = this.rows.find((row) => row.tokenHash === tokenHash);
    if (!found) return Promise.resolve(null);
    const account = this.accounts.get(found.accountId);
    return Promise.resolve({
      ...found,
      accountVerified: account !== undefined && account.verifiedAt !== null,
    });
  }

  complete(input: { verificationId: string; accountId: string; at: Date }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === input.verificationId);
    if (row) row.usedAt = input.at;
    const account = this.accounts.get(input.accountId);
    if (account && account.verifiedAt === null) account.verifiedAt = input.at;
    return Promise.resolve();
  }

  targetOf(accountId: string): Promise<VerificationTarget | null> {
    const account = this.accounts.get(accountId);
    return Promise.resolve(
      account ? { email: account.email, verified: account.verifiedAt !== null } : null,
    );
  }
}

// Remitente que guarda lo que se le pidió enviar; con `failWith` simula un proveedor caído.
export class RecordingSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }

  // El token que viajó en el último enlace enviado.
  lastToken(): string {
    const text = this.sent.at(-1)?.text ?? '';
    return /token=([\w-]+)/.exec(text)?.[1] ?? '';
  }
}
