import type { Account, Role } from './account-repository';

// Una cuenta que se puede vincular con Google: además de lo de siempre, si ya verificó su correo.
export interface LinkableAccount extends Account {
  emailVerified: boolean;
}

export interface GoogleLink {
  accountId: string;
  // El `sub` de Google: fijo aunque la persona cambie de correo.
  subject: string;
  // El correo queda verificado: Google ya lo comprobó.
  verifiedAt: Date;
  // Grill de la #178, pregunta 4: al vincular una cuenta sin verificar se borran su contraseña y sus
  // sesiones, para que nadie que haya registrado antes el correo ajeno conserve el acceso.
  forgetPassword: boolean;
}

// RF-001 (#181): la cuenta de quien entró con Google y aceptó la política. Sin contraseña.
export interface NewGoogleAccount {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  policyVersion: string;
  policyAcceptedAt: Date;
  googleSubject: string;
  emailVerifiedAt: Date;
}

// ADR-029, fase 2 (#180): puerto propio del vínculo con Google, para no ensanchar AccountRepository.
export interface GoogleAccountLinks {
  findBySubject(subject: string): Promise<Account | null>;
  findByEmail(email: string): Promise<LinkableAccount | null>;
  // Una sola transacción.
  link(link: GoogleLink): Promise<void>;
  // false si el correo ya tiene cuenta (otra petición la creó mientras tanto); no cambia nada.
  createLinked(account: NewGoogleAccount): Promise<boolean>;
}

export const GOOGLE_ACCOUNT_LINKS = Symbol('GOOGLE_ACCOUNT_LINKS');
