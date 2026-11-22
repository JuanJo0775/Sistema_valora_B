import type { EmailMessage, EmailSender } from './email-sender';

export interface NotifyAccountPorts {
  // El correo de la cuenta solo si está verificado (ADR-029); null si no o si ya no existe.
  accounts: { verifiedEmailOf(accountId: string): Promise<string | null> };
  sender: EmailSender;
}

// Puerta de entrada pública (B9, #209): otro módulo avisa a una cuenta por su id y nunca ve el
// correo, que vive solo en identity (EC-08, Ley 1581). true si se envió.
export class NotifyAccount {
  constructor(private readonly ports: NotifyAccountPorts) {}

  async send(accountId: string, notice: Omit<EmailMessage, 'to'>): Promise<boolean> {
    const email = await this.ports.accounts.verifiedEmailOf(accountId);
    if (email === null) return false;
    await this.ports.sender.send({ to: email, ...notice });
    return true;
  }
}
