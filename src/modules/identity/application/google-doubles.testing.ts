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

  constructor(private readonly accounts: (LinkableAccount & { googleSubject?: string })[] = []) {}

  findBySubject(subject: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.find((a) => a.googleSubject === subject) ?? null);
  }

  findByEmail(email: string): Promise<LinkableAccount | null> {
    return Promise.resolve(this.accounts.find((a) => a.email === email) ?? null);
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
