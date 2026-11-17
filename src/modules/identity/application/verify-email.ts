import { DomainError } from '../../../domain/domain-error';
import { type AttemptLimiter, type AttemptRule, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { EmailVerificationRepository } from './email-verification-repository';
import { hashVerificationToken } from './verification-token';

export interface VerifyEmailPorts {
  verifications: EmailVerificationRepository;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface VerifyEmailInput {
  token: string;
  ip: string;
}

// Límite provisional por IP (ADR-029): 20 intentos en 15 minutos, cuenten o no.
export const VERIFICATIONS_PER_IP: AttemptRule = { limit: 20, windowMinutes: 15 };

// Token desconocido, vencido o usado: un solo error, sin decir cuál (no ayuda a quien adivina). Como
// toda regla de negocio incumplida, responde 422 con su código.
export class InvalidVerificationTokenError extends DomainError {
  readonly code = 'INVALID_VERIFICATION_TOKEN';

  constructor() {
    super('El enlace de verificación no es válido o ya venció. Pide uno nuevo.');
  }
}

export class VerifyEmail {
  constructor(private readonly ports: VerifyEmailPorts) {}

  async execute(input: VerifyEmailInput): Promise<void> {
    const ipKey = `verificar-ip:${input.ip}`;
    const wait = this.ports.limiter.retryAfterSeconds(ipKey, VERIFICATIONS_PER_IP);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    this.ports.limiter.record(ipKey, VERIFICATIONS_PER_IP);

    const found = await this.ports.verifications.findByTokenHash(
      hashVerificationToken(input.token),
    );
    const now = this.ports.clock.now();
    if (!found || found.usedAt !== null || found.expiresAt <= now) {
      throw new InvalidVerificationTokenError();
    }
    // Si la cuenta ya estaba verificada, el token se gasta igual y la fecha original no cambia.
    await this.ports.verifications.complete({
      verificationId: found.id,
      accountId: found.accountId,
      at: now,
    });
  }
}
