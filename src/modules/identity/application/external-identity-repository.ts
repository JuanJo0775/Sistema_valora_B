import type { Account, NewAccount } from './account-repository';

// ADR-033: un solo proveedor por ahora.
export type IdentityProvider = 'google';

// Puerto del repositorio de identidades externas. Cada método es una sola transacción.
export interface ExternalIdentityRepository {
  // La cuenta enlazada a ese `sub`, o null.
  findAccountBySubject(provider: IdentityProvider, subject: string): Promise<Account | null>;
  // Si la cuenta ya tiene alguna identidad de ese proveedor.
  hasIdentity(accountId: string, provider: IdentityProvider): Promise<boolean>;
  // Enlaza la identidad a una cuenta existente. Con `claimUnverified` (el correo de la cuenta nunca se
  // verificó), en la misma transacción: anula la contraseña, revoca todas las sesiones y marca el correo
  // como verificado. Lanza si el `sub` ya está enlazado (dos intentos a la vez).
  link(input: {
    accountId: string;
    provider: IdentityProvider;
    subject: string;
    now: Date;
    claimUnverified: boolean;
  }): Promise<void>;
  // Crea la cuenta (correo verificado, sin contraseña) y su identidad, juntas.
  createWithIdentity(input: {
    account: NewAccount;
    provider: IdentityProvider;
    subject: string;
    now: Date;
  }): Promise<void>;
}

export const EXTERNAL_IDENTITY_REPOSITORY = Symbol('EXTERNAL_IDENTITY_REPOSITORY');
