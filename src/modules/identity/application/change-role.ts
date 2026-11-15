import type { AccountRepository, Role } from './account-repository';
import type { Clock } from './clock';
import { normalizeEmail } from './register-account';

export interface ChangeRolePorts {
  accounts: Pick<AccountRepository, 'findByEmail' | 'applyRoleChange'>;
  clock: Clock;
}

export interface ChangeRoleRequest {
  email: string;
  role: Role;
  note: string;
  // Cuenta del moderador que lo pide, o null si es el sistema (comando identity:set-role).
  changedBy: string | null;
}

// Grill de la #73, pregunta 3: el motivo es obligatorio, de 10 a 500 caracteres.
export const ROLE_NOTE_LENGTH = { min: 10, max: 500 } as const;

// Dato de entrada inválido: la capa HTTP lo traduce a 400 VALIDATION_ERROR.
export class InvalidRoleNoteError extends Error {
  constructor() {
    super(
      `El motivo es obligatorio, de ${String(ROLE_NOTE_LENGTH.min)} a ${String(ROLE_NOTE_LENGTH.max)} caracteres.`,
    );
    this.name = 'InvalidRoleNoteError';
  }
}

// No es una regla de negocio incumplida (422): la capa HTTP la traduce a 404 NOT_FOUND.
export class AccountNotFoundError extends Error {
  constructor() {
    super('Ninguna cuenta tiene ese correo.');
    this.name = 'AccountNotFoundError';
  }
}

// Pregunta 1: así la aplicación no se queda sin moderadores por error (409).
export class OwnRoleError extends Error {
  readonly code = 'OWN_ROLE';

  constructor() {
    super('Un moderador no puede cambiar su propio rol.');
    this.name = 'OwnRoleError';
  }
}

// Pregunta 1: no se anota un cambio que no cambia nada (409).
export class RoleUnchangedError extends Error {
  readonly code = 'ROLE_UNCHANGED';

  constructor() {
    super('La cuenta ya tiene ese rol.');
    this.name = 'RoleUnchangedError';
  }
}

// RF-002 RN1 y RN4 (grill de la #73): un moderador o el sistema cambia el rol de una cuenta, y el
// cambio queda en la bitácora.
export class ChangeRole {
  constructor(private readonly ports: ChangeRolePorts) {}

  async execute(request: ChangeRoleRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < ROLE_NOTE_LENGTH.min || note.length > ROLE_NOTE_LENGTH.max) {
      throw new InvalidRoleNoteError();
    }
    const { accounts, clock } = this.ports;
    const account = await accounts.findByEmail(normalizeEmail(request.email));
    if (!account) throw new AccountNotFoundError();
    if (account.id === request.changedBy) throw new OwnRoleError();
    if (account.role === request.role) throw new RoleUnchangedError();
    await accounts.applyRoleChange({
      accountId: account.id,
      fromRole: account.role,
      toRole: request.role,
      changedBy: request.changedBy,
      note,
      changedAt: clock.now(),
    });
  }
}
