// Grill de la #16, pregunta 5: un rol por cuenta.
export type Role = 'reportante' | 'comercio' | 'moderador';

// H33 (ADR-038): por qué está suspendida una cuenta, en un conjunto estable que es seguro mostrarle a ella:
// nunca la nota del moderador ni quién denunció. «no_registrada» cubre las suspensiones anteriores al
// registro de la causa.
export type SuspensionReason = 'observada_por_moderacion' | 'descartes_seguidos' | 'no_registrada';

export interface Account {
  id: string;
  email: string;
  // ADR-029, fase 2 (#179): null en las cuentas creadas con Google, que no tienen contraseña.
  passwordHash: string | null;
  role: Role;
  // Grill de la #33, pregunta 4: hasta cuándo está suspendida, o null.
  suspendedUntil: Date | null;
  // ADR-032: cuándo se borra la cuenta de forma definitiva; null si no hay eliminación pendiente.
  deletionScheduledFor: Date | null;
}

// Consentimiento de datos (RF-001, Ley 1581): qué versión aceptó y cuándo.
export interface NewAccount extends Omit<
  Account,
  'passwordHash' | 'suspendedUntil' | 'deletionScheduledFor'
> {
  passwordHash: string;
  // #133: el nombre visible, ya normalizado. Solo lo ve la propia cuenta (EC-08).
  displayName: string | null;
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
