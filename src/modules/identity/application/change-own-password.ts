import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import {
  AccountGoneError,
  DELETION_ATTEMPTS_PER_IP,
  DELETION_FAILURES_PER_ACCOUNT,
  InvalidPasswordError,
} from './delete-own-account';
import type { PasswordHasher } from './password-hasher';
import { isAcceptablePassword, WeakPasswordError } from './password-policy';
import type { PasswordRepository } from './password-repository';
import { isRecentSession, ReauthRequiredError } from './recent-session';

export { TooManyAttemptsError } from './attempt-limiter';

// Mismos topes que eliminar la cuenta (ADR-032): 5 fallos por cuenta y 20 intentos por IP en 15 minutos.
export const changeAccountKey = (accountId: string) => `cambiar-clave:${accountId}`;
export const changeIpKey = (ip: string) => `cambiar-clave-ip:${ip}`;

export interface ChangeOwnPasswordPorts {
  passwords: PasswordRepository;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface ChangeOwnPasswordInput {
  accountId: string;
  sessionId: string;
  sessionCreatedAt: Date;
  ip: string;
  // Obligatoria si la cuenta ya tiene contraseña; se ignora si no la tiene.
  currentPassword?: string;
  newPassword: string;
}

// Cambia la contraseña de la sesión, o la crea si la cuenta entró con Google (sin contraseña): en ese caso
// la sesión debe ser reciente. Las otras sesiones se cierran; la actual sigue.
export class ChangeOwnPassword {
  constructor(private readonly ports: ChangeOwnPasswordPorts) {}

  async execute(input: ChangeOwnPasswordInput): Promise<void> {
    const { passwords, hasher, limiter, clock } = this.ports;
    const accountKey = changeAccountKey(input.accountId);
    const ipKey = changeIpKey(input.ip);
    const wait =
      limiter.retryAfterSeconds(ipKey, DELETION_ATTEMPTS_PER_IP) ??
      limiter.retryAfterSeconds(accountKey, DELETION_FAILURES_PER_ACCOUNT);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(ipKey, DELETION_ATTEMPTS_PER_IP);

    const credentials = await passwords.credentialsOf(input.accountId);
    if (credentials === null) throw new AccountGoneError();
    const now = clock.now();
    if (credentials.passwordHash === null) {
      if (!isRecentSession(input.sessionCreatedAt, now)) throw new ReauthRequiredError();
    } else {
      const valid =
        input.currentPassword !== undefined &&
        (await hasher.verify(credentials.passwordHash, input.currentPassword));
      if (!valid) {
        limiter.record(accountKey, DELETION_FAILURES_PER_ACCOUNT);
        throw new InvalidPasswordError();
      }
    }

    if (!isAcceptablePassword(input.newPassword)) throw new WeakPasswordError();
    await passwords.changePassword({
      accountId: input.accountId,
      passwordHash: await hasher.hash(input.newPassword),
      keepSessionId: input.sessionId,
      at: now,
    });
    limiter.reset(accountKey);
  }
}
