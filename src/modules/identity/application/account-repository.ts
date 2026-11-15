// Grill de la #16, pregunta 5: un rol por cuenta.
export type Role = 'reportante' | 'comercio' | 'moderador';

export interface Account {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  // Grill de la #33, pregunta 4: hasta cuándo está suspendida, o null.
  suspendedUntil: Date | null;
}

// Consentimiento de datos (RF-001, Ley 1581): qué versión aceptó y cuándo.
export interface NewAccount extends Omit<Account, 'suspendedUntil'> {
  policyVersion: string;
  policyAcceptedAt: Date;
}

// Grill de la #73, pregunta 3: un cambio de rol y su anotación en la bitácora.
export interface RoleChange {
  accountId: string;
  fromRole: Role;
  toRole: Role;
  // null: el sistema (comando identity:set-role).
  changedBy: string | null;
  note: string;
  changedAt: Date;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface AccountRepository {
  findByEmail(email: string): Promise<Account | null>;
  create(account: NewAccount): Promise<void>;
  // Cambia el rol y lo anota en la bitácora, juntos.
  applyRoleChange(change: RoleChange): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
