import { randomUUID } from 'node:crypto';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import type { AccountRepository } from './account-repository';
import type { AttemptLimiter } from './attempt-limiter';
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

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export const emailKey = (email: string) => `login-correo:${email}`;

export class Login {
  constructor(private readonly ports: LoginPorts) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const account = await this.ports.accounts.findByEmail(email);
    if (!account) throw new Error('pendiente');
    await this.ports.hasher.verify(account.passwordHash, input.password);

    // Grill de la #16, pregunta 3: cada inicio de sesión crea una sesión y un token nuevos.
    const token = newSessionToken();
    const now = this.ports.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * DAY_IN_MILLISECONDS);
    await this.ports.sessions.create({
      id: randomUUID(),
      tokenHash: hashSessionToken(token),
      accountId: account.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    this.ports.limiter.reset(emailKey(email));
    return { token, expiresAt };
  }
}
