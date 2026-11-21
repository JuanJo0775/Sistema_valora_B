import { randomUUID } from 'node:crypto';
import type { AccountDeletionRepository } from './account-deletion-repository';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import {
  emailKey,
  InvalidCredentialsError,
  LOGIN_ATTEMPTS_PER_IP,
  LOGIN_FAILURES_PER_EMAIL,
  type LoginInput,
  type LoginResult,
} from './login';
import type { PasswordHasher } from './password-hasher';
import { normalizeEmail } from './register-account';
import type { SessionRepository } from './session-repository';
import { startSession } from './start-session';

export interface RestoreAccountPorts {
  accounts: AccountRepository;
  deletion: AccountDeletionRepository;
  hasher: PasswordHasher;
  sessions: SessionRepository;
  limiter: AttemptLimiter;
  clock: Clock;
}

// ADR-032: cancela la eliminación pendiente y deja la sesión iniciada, igual que el inicio de sesión.
// Usa los mismos límites y las mismas claves que el login (no da otra vía para probar contraseñas), y
// falla igual si el correo no existe, la contraseña es mala o la cuenta no estaba pendiente.
export class RestoreAccount {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly ports: RestoreAccountPorts) {}

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
    // cancel() es condicional: si la purga ganó la carrera, devuelve false y el error es el genérico.
    const restored =
      account && valid && account.deletionScheduledFor
        ? await this.ports.deletion.cancel(account.id)
        : false;
    if (!account || !restored) {
      limiter.record(emailKey(email), LOGIN_FAILURES_PER_EMAIL);
      throw new InvalidCredentialsError();
    }

    const session = await startSession(this.ports, account.id);
    limiter.reset(emailKey(email));
    return session;
  }

  private dummy(): Promise<string> {
    this.dummyHash ??= this.ports.hasher.hash(randomUUID());
    return this.dummyHash;
  }
}
