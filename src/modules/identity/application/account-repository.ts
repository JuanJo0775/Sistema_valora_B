// Grill de la #16, pregunta 5: un rol por cuenta.
export type Role = 'reportante' | 'comercio' | 'moderador';

export interface Account {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
}

// Consentimiento de datos (RF-001, Ley 1581): qué versión aceptó y cuándo.
export interface NewAccount extends Account {
  policyVersion: string;
  policyAcceptedAt: Date;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface AccountRepository {
  findByEmail(email: string): Promise<Account | null>;
  create(account: NewAccount): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
