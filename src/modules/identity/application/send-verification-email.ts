import { randomUUID } from 'node:crypto';
import type { Clock } from './clock';
import type { EmailSender } from './email-sender';
import type { EmailVerificationRepository } from './email-verification-repository';
import { hashVerificationToken, newVerificationToken } from './verification-token';

// ADR-029: el enlace vale 24 horas.
export const VERIFICATION_TTL_HOURS = 24;

export interface SendVerificationEmailPorts {
  verifications: EmailVerificationRepository;
  sender: EmailSender;
  clock: Clock;
  // Base pública de los enlaces (APP_URL), la dirección de la PWA.
  appUrl: string;
}

export interface SendVerificationEmailInput {
  accountId: string;
  email: string;
}

// Crea un token nuevo, deja sin efecto los anteriores sin usar y envía el enlace a la PWA.
export class SendVerificationEmail {
  constructor(private readonly ports: SendVerificationEmailPorts) {}

  async execute(input: SendVerificationEmailInput): Promise<void> {
    const token = newVerificationToken();
    const now = this.ports.clock.now();
    await this.ports.verifications.deleteUnusedOf(input.accountId);
    await this.ports.verifications.create({
      id: randomUUID(),
      accountId: input.accountId,
      tokenHash: hashVerificationToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
    });
    const base = this.ports.appUrl.replace(/\/+$/, '');
    await this.ports.sender.send({
      to: input.email,
      subject: 'Verifica tu correo en Valora',
      text: [
        'Hola. Para verificar tu correo y poder registrar precios en Valora, abre este enlace:',
        '',
        `${base}/verificar-correo?token=${token}`,
        '',
        `El enlace vale ${String(VERIFICATION_TTL_HOURS)} horas y solo se puede usar una vez.`,
        'Si no creaste una cuenta en Valora, ignora este mensaje.',
      ].join('\n'),
    });
  }
}
