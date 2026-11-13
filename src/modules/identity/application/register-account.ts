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
    const email = normalizeEmail(input.email);
    // Grill de la #16, pregunta 6: el hash se calcula siempre, para que un correo existente tarde
    // lo mismo; si ya existe, no se cambia nada y el resultado es igual.
    const passwordHash = await this.ports.hasher.hash(input.password);
    if (await this.ports.accounts.findByEmail(email)) return;
    await this.ports.accounts.create({
      id: randomUUID(),
      email,
      passwordHash,
      // Grill de la #16, pregunta 5: el registro siempre crea un reportante.
      role: 'reportante',
      policyVersion: input.acceptedPolicyVersion,
      policyAcceptedAt: this.ports.clock.now(),
    });
  }
}
