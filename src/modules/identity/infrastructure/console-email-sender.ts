import type { EmailMessage, EmailSender } from '../application/email-sender';

export interface ConsoleEmailSenderOptions {
  // En producción nunca se escribe el enlace (es una credencial de un solo uso) ni el destinatario.
  production: boolean;
  log: (line: string) => void;
}

// ADR-029: para desarrollo y pruebas. Se usa solo con EMAIL_PROVIDER=console: el enlace aparece en el
// registro para poder verificar sin un proveedor de correo.
export class ConsoleEmailSender implements EmailSender {
  constructor(private readonly options: ConsoleEmailSenderOptions) {}

  send(message: EmailMessage): Promise<void> {
    if (this.options.production) {
      this.options.log(
        `Correo «${message.subject}» no enviado: EMAIL_PROVIDER=console no entrega mensajes. Configura EMAIL_PROVIDER=resend.`,
      );
    } else {
      this.options.log(`Correo para ${message.to}: ${message.subject}\n${message.text}`);
    }
    return Promise.resolve();
  }
}
