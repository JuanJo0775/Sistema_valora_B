import { randomUUID } from 'node:crypto';
import type { AccountRepository } from './account-repository';
import type { Clock } from './clock';
import type { PasswordHasher } from './password-hasher';

export interface RegisterAccountPorts {
  accounts: AccountRepository;
  hasher: PasswordHasher;
  clock: Clock;
}

export interface RegisterAccountInput {
  email: string;
  password: string;
  acceptedPolicyVersion: string;
}

// Grill de la #16, pregunta 7: sin espacios y en minúsculas, así Ana@Correo.com es ana@correo.com.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class RegisterAccount {
  constructor(private readonly ports: RegisterAccountPorts) {}

  async execute(input: RegisterAccountInput): Promise<void> {
    await this.ports.accounts.create({
      id: randomUUID(),
      email: normalizeEmail(input.email),
      passwordHash: await this.ports.hasher.hash(input.password),
      // Grill de la #16, pregunta 5: el registro siempre crea un reportante.
      role: 'reportante',
      policyVersion: input.acceptedPolicyVersion,
      policyAcceptedAt: this.ports.clock.now(),
    });
  }
}
