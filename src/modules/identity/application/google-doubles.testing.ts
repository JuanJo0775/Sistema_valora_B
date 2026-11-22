import type { Account } from './account-repository';
import type {
  GoogleAccountLinks,
  GoogleLink,
  LinkableAccount,
  NewGoogleAccount,
} from './google-account-links';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Cuentas en memoria para entrar con
// Google: guarda los vínculos y las cuentas que se piden; createLinked respeta el correo único.
export class InMemoryGoogleLinks implements GoogleAccountLinks {
  readonly links: GoogleLink[] = [];
  readonly created: NewGoogleAccount[] = [];
  // Cuentas cuya eliminación pendiente se canceló (ADR-033).
  readonly cancelled: string[] = [];
  // Simula que la purga o otra petición ganó la carrera: cancel() devuelve false.
  cancelFails = false;

  constructor(private readonly accounts: (LinkableAccount & { googleSubject?: string })[] = []) {}

  findBySubject(subject: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.find((a) => a.googleSubject === subject) ?? null);
  }

  findByEmail(email: string): Promise<LinkableAccount | null> {
    return Promise.resolve(this.accounts.find((a) => a.email === email) ?? null);
  }

  // Como AccountDeletionRepository.cancel: condicional a que la cuenta siga pendiente.
  cancel(accountId: string): Promise<boolean> {
    const account = this.accounts.find((a) => a.id === accountId);
    if (this.cancelFails || !account?.deletionScheduledFor) return Promise.resolve(false);
    account.deletionScheduledFor = null;
    this.cancelled.push(accountId);
    return Promise.resolve(true);
  }

  link(link: GoogleLink): Promise<void> {
    this.links.push(link);
    return Promise.resolve();
  }

  createLinked(account: NewGoogleAccount): Promise<boolean> {
    if (this.accounts.some((a) => a.email === account.email)) return Promise.resolve(false);
    this.created.push(account);
    return Promise.resolve(true);
  }
}
