import { type AttemptLimiter, type AttemptRule, TooManyAttemptsError } from './attempt-limiter';
import type { EmailVerificationRepository } from './email-verification-repository';
import type { SendVerificationEmailInput } from './send-verification-email';

export interface ResendVerificationPorts {
  verifications: EmailVerificationRepository;
  limiter: AttemptLimiter;
  send: { execute(input: SendVerificationEmailInput): Promise<void> };
}

// Límite provisional (ADR-029): 3 reenvíos por hora por cuenta de la sesión.
export const RESENDS_PER_ACCOUNT: AttemptRule = { limit: 3, windowMinutes: 60 };

// El reenvío es de la cuenta con sesión, no de un correo que se escribe: no hay nada que enumerar.
export class ResendVerification {
  constructor(private readonly ports: ResendVerificationPorts) {}

  async execute(input: { accountId: string }): Promise<void> {
    const key = `reenvio-verificacion:${input.accountId}`;
    const wait = this.ports.limiter.retryAfterSeconds(key, RESENDS_PER_ACCOUNT);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    this.ports.limiter.record(key, RESENDS_PER_ACCOUNT);

    const target = await this.ports.verifications.targetOf(input.accountId);
    // Ya verificada (o cuenta desaparecida): responde igual y no envía nada.
    if (!target || target.verified) return;
    await this.ports.send.execute({ accountId: input.accountId, email: target.email });
  }
}
