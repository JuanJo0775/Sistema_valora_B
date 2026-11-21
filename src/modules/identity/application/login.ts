import { randomUUID } from 'node:crypto';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';
import { normalizeEmail } from './register-account';
import type { SessionRepository } from './session-repository';
import { startSession } from './start-session';

export interface LoginPorts {
  accounts: AccountRepository;
  hasher: PasswordHasher;
  sessions: SessionRepository;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
}

export { TooManyAttemptsError } from './attempt-limiter';

export const emailKey = (email: string) => `login-correo:${email}`;

// ADR-032: credenciales correctas de una cuenta con la eliminación pendiente.
export class AccountPendingDeletionError extends Error {
  constructor(readonly scheduledFor: Date) {
    super(
      'La cuenta está pendiente de eliminación; puedes restaurarla antes de la fecha indicada.',
    );
  }
}

// Grill de la #16, pregunta 6: el mismo error y el mismo mensaje, exista o no la cuenta.
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos.');
  }
}

// Límites provisionales (pregunta 10): 5 fallos por correo y 20 intentos por IP en 15 minutos.
export const LOGIN_FAILURES_PER_EMAIL = { limit: 5, windowMinutes: 15 };
export const LOGIN_ATTEMPTS_PER_IP = { limit: 20, windowMinutes: 15 };

export class Login {
  // Hash de una clave aleatoria: se verifica contra él cuando la cuenta no existe, para que tarde lo
  // mismo. Se calcula una sola vez, la primera vez que hace falta.
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly ports: LoginPorts) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const { limiter } = this.ports;
    const ipKey = `login-ip:${input.ip}`;
    const wait =
      limiter.retryAfterSeconds(ipKey, LOGIN_ATTEMPTS_PER_IP) ??
      limiter.retryAfterSeconds(emailKey(email), LOGIN_FAILURES_PER_EMAIL);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(ipKey, LOGIN_ATTEMPTS_PER_IP);

    const account = await this.ports.accounts.findByEmail(email);
    const hash = account?.passwordHash ?? (await this.dummy());
    const valid = await this.ports.hasher.verify(hash, input.password);
    if (!account || !valid) {
      limiter.record(emailKey(email), LOGIN_FAILURES_PER_EMAIL);
      throw new InvalidCredentialsError();
    }

    // ADR-032: con la contraseña correcta, una cuenta pendiente de eliminación no abre sesión; se le dice
    // cuándo se borra y que puede restaurarla. Solo lo sabe quien acertó la contraseña.
    if (account.deletionScheduledFor) {
      throw new AccountPendingDeletionError(account.deletionScheduledFor);
    }

    const { token, expiresAt } = await startSession(this.ports, account.id);
    limiter.reset(emailKey(email));
    return { token, expiresAt };
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= this.ports.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
