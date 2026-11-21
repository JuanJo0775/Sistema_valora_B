import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';
import { normalizeEmail } from './register-account';

// ADR-032: la eliminación es definitiva, pero tarda 10 días en ejecutarse; en ese lapso la persona puede
// restaurar la cuenta iniciando sesión de nuevo.
export const ACCOUNT_DELETION_GRACE_DAYS = 10;

// Mismos topes que el inicio de sesión (#16, pregunta 10): 5 fallos por cuenta y 20 intentos por IP en 15
// minutos.
export const DELETION_FAILURES_PER_ACCOUNT = { limit: 5, windowMinutes: 15 };
export const DELETION_ATTEMPTS_PER_IP = { limit: 20, windowMinutes: 15 };

export const deletionAccountKey = (accountId: string) => `eliminar-cuenta:${accountId}`;
export const deletionIpKey = (ip: string) => `eliminar-cuenta-ip:${ip}`;

export { TooManyAttemptsError } from './attempt-limiter';

// 403 INVALID_PASSWORD. Mensaje genérico, sin decir nada más de la cuenta.
export class InvalidPasswordError extends Error {
  constructor() {
    super('La contraseña no es correcta.');
  }
}

// 403 INVALID_CONFIRMATION: una cuenta sin contraseña escribió un correo que no es el suyo (#179).
export class InvalidConfirmationError extends Error {
  constructor() {
    super('El correo no coincide con el de la cuenta.');
  }
}

// 403 LAST_MODERATOR_CANNOT_DELETE: la plataforma no puede quedarse sin moderadores.
export class LastModeratorError extends Error {
  constructor() {
    super('Eres el único moderador: nombra a otro antes de eliminar tu cuenta.');
  }
}

// La cuenta de la sesión ya no existe (otra petición la borró): 401.
export class AccountGoneError extends Error {
  constructor() {
    super('La cuenta ya no existe.');
  }
}

export interface DeleteOwnAccountPorts {
  deletion: AccountDeletionRepository;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
  clock: Clock;
}

// La cuenta con contraseña confirma con ella; la creada con Google, con su correo (grill de la #178,
// pregunta 3).
export type DeleteOwnAccountInput = { accountId: string; ip: string } & (
  | { password: string }
  | { confirmEmail: string }
);

export interface DeleteOwnAccountResult {
  scheduledFor: Date;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Derecho de supresión (Ley 1581, art. 8): comprueba la contraseña, marca la cuenta para borrarla en 10
// días y cierra todas sus sesiones. Pedirlo otra vez no mueve la fecha.
export class DeleteOwnAccount {
  constructor(private readonly ports: DeleteOwnAccountPorts) {}

  async execute(input: DeleteOwnAccountInput): Promise<DeleteOwnAccountResult> {
    const { deletion, hasher, limiter, clock } = this.ports;
    const accountKey = deletionAccountKey(input.accountId);
    const ipKey = deletionIpKey(input.ip);
    const wait =
      limiter.retryAfterSeconds(ipKey, DELETION_ATTEMPTS_PER_IP) ??
      limiter.retryAfterSeconds(accountKey, DELETION_FAILURES_PER_ACCOUNT);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(ipKey, DELETION_ATTEMPTS_PER_IP);

    const credentials = await deletion.credentialsOf(input.accountId);
    if (credentials === null) throw new AccountGoneError();
    if (
      'password' in input &&
      (credentials.passwordHash === null ||
        !(await hasher.verify(credentials.passwordHash, input.password)))
    ) {
      limiter.record(accountKey, DELETION_FAILURES_PER_ACCOUNT);
      throw new InvalidPasswordError();
    }
    // Quien tiene contraseña confirma con ella: el correo solo vale para las cuentas creadas con Google.
    if (credentials.passwordHash !== null && !('password' in input)) {
      limiter.record(accountKey, DELETION_FAILURES_PER_ACCOUNT);
      throw new InvalidPasswordError();
    }
    if ('confirmEmail' in input && normalizeEmail(input.confirmEmail) !== credentials.email) {
      limiter.record(accountKey, DELETION_FAILURES_PER_ACCOUNT);
      throw new InvalidConfirmationError();
    }

    const now = clock.now();
    const result = await deletion.schedule({
      accountId: input.accountId,
      scheduledFor: new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_IN_MILLISECONDS),
      now,
    });
    if (result.outcome === 'gone') throw new AccountGoneError();
    if (result.outcome === 'last-moderator') throw new LastModeratorError();
    limiter.reset(accountKey);
    return { scheduledFor: result.scheduledFor };
  }
}
