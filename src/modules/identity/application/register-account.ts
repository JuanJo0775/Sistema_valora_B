import { randomUUID } from 'node:crypto';
import { normalizeDisplayName } from '../../../domain/display-name';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';

export interface RegisterAccountPorts {
  accounts: AccountRepository;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
  clock: Clock;
}

export interface RegisterAccountInput {
  email: string;
  // #133: ya validado por el DTO con la regla de domain/display-name.
  displayName?: string;
  password: string;
  acceptedPolicyVersion: string;
  ip: string;
}

// Límite provisional (grill de la #16, pregunta 10): 10 registros por IP en 15 minutos.
export const REGISTRATIONS_PER_IP = { limit: 10, windowMinutes: 15 };

// Grill de la #16, pregunta 7: sin espacios y en minúsculas, así Ana@Correo.com es ana@correo.com.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class RegisterAccount {
  constructor(private readonly ports: RegisterAccountPorts) {}

  async execute(input: RegisterAccountInput): Promise<void> {
    const ipKey = `registro-ip:${input.ip}`;
    const wait = this.ports.limiter.retryAfterSeconds(ipKey, REGISTRATIONS_PER_IP);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    this.ports.limiter.record(ipKey, REGISTRATIONS_PER_IP);

    const email = normalizeEmail(input.email);
    // Grill de la #16, pregunta 6: el hash se calcula siempre, para que un correo existente tarde
    // lo mismo; si ya existe, no se cambia nada y el resultado es igual.
    const passwordHash = await this.ports.hasher.hash(input.password);
    if (await this.ports.accounts.findByEmail(email)) return;
    await this.ports.accounts.create({
      id: randomUUID(),
      email,
      displayName: input.displayName === undefined ? null : normalizeDisplayName(input.displayName),
      passwordHash,
      // Grill de la #16, pregunta 5: el registro siempre crea un reportante.
      role: 'reportante',
      policyVersion: input.acceptedPolicyVersion,
      policyAcceptedAt: this.ports.clock.now(),
    });
  }
}
