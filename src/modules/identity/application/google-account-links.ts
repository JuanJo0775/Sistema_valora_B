import type { Account } from './account-repository';

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

// ADR-029, fase 2 (#180): puerto propio del vínculo con Google, para no ensanchar AccountRepository.
export interface GoogleAccountLinks {
  findBySubject(subject: string): Promise<Account | null>;
  findByEmail(email: string): Promise<LinkableAccount | null>;
  // Una sola transacción.
  link(link: GoogleLink): Promise<void>;
}

export const GOOGLE_ACCOUNT_LINKS = Symbol('GOOGLE_ACCOUNT_LINKS');
