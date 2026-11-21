import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';

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

// 403 LAST_MODERATOR_CANNOT_DELETE: la plataforma no puede quedarse sin moderadores.
export class LastModeratorError extends Error {
  constructor() {
    super('Eres el único moderador: nombra a otro antes de eliminar tu cuenta.');
  }
}

// 400: la cuenta tiene contraseña y no vino en el cuerpo.
export class PasswordRequiredError extends Error {
  constructor() {
    super('La contraseña es obligatoria.');
  }
}

// ADR-033: las cuentas de Google no tienen contraseña; eliminar pide que la sesión sea reciente. 403
// REAUTH_REQUIRED: el frontend le pide a la persona volver a entrar con Google.
export class ReauthRequiredError extends Error {
  constructor() {
    super('Por seguridad, vuelve a iniciar sesión con Google para eliminar tu cuenta.');
  }
}

// Una sesión de una cuenta sin contraseña sirve para eliminar solo si se creó hace tan poco como esto.
export const REAUTH_WINDOW_MINUTES = 10;

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

export interface DeleteOwnAccountInput {
  accountId: string;
  // Ausente en las cuentas sin contraseña (ADR-033).
  password?: string;
  // Cuándo se creó la sesión que hace la petición.
  sessionCreatedAt: Date;
  ip: string;
}

export interface DeleteOwnAccountResult {
  scheduledFor: Date;
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Derecho de supresión (Ley 1581, art. 8): comprueba la contraseña (o, en una cuenta de Google, que la sesión sea reciente), marca la cuenta para borrarla en 10
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
    const now = clock.now();
    if (credentials.passwordHash === null) {
      // ADR-033: sin contraseña, la prueba de identidad es haber entrado con Google hace poco.
      const ageMs = now.getTime() - input.sessionCreatedAt.getTime();
      if (ageMs > REAUTH_WINDOW_MINUTES * 60 * 1000) throw new ReauthRequiredError();
    } else {
      if (input.password === undefined) throw new PasswordRequiredError();
      if (!(await hasher.verify(credentials.passwordHash, input.password))) {
        limiter.record(accountKey, DELETION_FAILURES_PER_ACCOUNT);
        throw new InvalidPasswordError();
      }
    }

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
