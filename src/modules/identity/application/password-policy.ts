import { DomainError } from '../../../domain/domain-error';

// Las reglas de la contraseña, las mismas al registrarse, al restablecerla y al cambiarla (grill de la
// #16): de 10 a 128 caracteres.
export const PASSWORD_LENGTH = { min: 10, max: 128 };

export function isAcceptablePassword(password: string): boolean {
  return password.length >= PASSWORD_LENGTH.min && password.length <= PASSWORD_LENGTH.max;
}

// La contraseña nueva no cumple las reglas. Por HTTP la rechaza antes el DTO (400); este error cubre
// al caso de uso cuando se llama sin pasar por él.
export class WeakPasswordError extends DomainError {
  readonly code = 'WEAK_PASSWORD';

  constructor() {
    super(
      `La contraseña debe tener entre ${String(PASSWORD_LENGTH.min)} y ${String(PASSWORD_LENGTH.max)} caracteres.`,
    );
  }
}
