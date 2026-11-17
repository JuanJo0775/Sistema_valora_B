import { randomUUID } from 'node:crypto';
import { normalizeDisplayName } from '../../../domain/display-name';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import { EmailSendError } from './email-sender';
import type { PasswordHasher } from './password-hasher';

export interface RegisterAccountPorts {
  accounts: AccountRepository;
  hasher: PasswordHasher;
  limiter: AttemptLimiter;
  clock: Clock;
  // ADR-029: envía el enlace de verificación a la cuenta nueva.
  verification: { execute(input: { accountId: string; email: string }): Promise<void> };
  // Aviso cuando el envío falla: el mensaje nunca lleva el correo ni el token.
  log: { warn(message: string): void };
}

export interface RegisterAccountInput {
  email: string;
  // #133: ya validado por el DTO con la regla de domain/display-name.
  displayName: string;
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
    const id = randomUUID();
    await this.ports.accounts.create({
      id,
      email,
      displayName: normalizeDisplayName(input.displayName),
      passwordHash,
      // Grill de la #16, pregunta 5: el registro siempre crea un reportante.
      role: 'reportante',
      policyVersion: input.acceptedPolicyVersion,
      policyAcceptedAt: this.ports.clock.now(),
    });
    this.sendVerificationInBackground(id, email);
  }

  // ADR-029: el registro no espera al proveedor de correo ni falla por él. Así tarda lo mismo con un
  // correo nuevo que con uno ya registrado (EC-08) y una caída del proveedor no impide crear cuentas;
  // la persona puede pedir el reenvío desde su sesión.
  private sendVerificationInBackground(accountId: string, email: string): void {
    this.ports.verification.execute({ accountId, email }).catch((error: unknown) => {
      const reason = error instanceof EmailSendError ? error.message : 'error inesperado';
      this.ports.log.warn(`No se pudo enviar el correo de verificación: ${reason}.`);
    });
  }
}
