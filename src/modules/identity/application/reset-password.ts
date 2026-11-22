import { DomainError } from '../../../domain/domain-error';
import { type AttemptLimiter, type AttemptRule, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';
import { isAcceptablePassword, WeakPasswordError } from './password-policy';
import type { PasswordRepository } from './password-repository';
import { hashVerificationToken } from './verification-token';

export interface ResetPasswordPorts {
  passwords: PasswordRepository;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  ip: string;
}

// Límite provisional por IP (como la verificación de correo): 20 intentos en 15 minutos.
export const RESETS_PER_IP: AttemptRule = { limit: 20, windowMinutes: 15 };

// Token desconocido, vencido o usado: un solo error, sin decir cuál. Responde 422 con su código.
export class InvalidResetTokenError extends DomainError {
  readonly code = 'INVALID_TOKEN';

  constructor() {
    super('El enlace no es válido o ya venció. Pide uno nuevo.');
  }
}

export class ResetPassword {
  constructor(private readonly ports: ResetPasswordPorts) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    const { limiter, hasher, passwords, clock } = this.ports;
    const ipKey = `restablecer-ip:${input.ip}`;
    const wait = limiter.retryAfterSeconds(ipKey, RESETS_PER_IP);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(ipKey, RESETS_PER_IP);

    if (!isAcceptablePassword(input.password)) throw new WeakPasswordError();
    // El hash se calcula antes de mirar el token: un token inexistente tarda lo mismo que uno bueno.
    const passwordHash = await hasher.hash(input.password);
    // Un solo paso atómico: dos peticiones con el mismo token no lo gastan dos veces.
    const redeemed = await passwords.redeem({
      tokenHash: hashVerificationToken(input.token),
      passwordHash,
      at: clock.now(),
    });
    if (!redeemed) throw new InvalidResetTokenError();
  }
}
