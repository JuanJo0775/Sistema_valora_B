import { randomUUID } from 'node:crypto';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';
import { normalizeEmail } from './register-account';
import type { SessionRepository } from './session-repository';
import { hashSessionToken, newSessionToken } from './session-token';

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

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export const emailKey = (email: string) => `login-correo:${email}`;

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

    const now = this.ports.clock.now();

    // Grill de la #16, pregunta 3: cada inicio de sesión crea una sesión y un token nuevos.
    const token = newSessionToken();
    const expiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * DAY_IN_MILLISECONDS);
    await this.ports.sessions.create({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      accountId: account.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    limiter.reset(emailKey(email));
    return { token, expiresAt };
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= this.ports.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
