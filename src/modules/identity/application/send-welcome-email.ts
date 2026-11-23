import type { Clock } from './clock';
import { EmailSendError, type EmailSender } from './email-sender';
import { senderNameOf, welcomeEmail } from './welcome-email';
import type { WelcomeRepository } from './welcome-repository';

export interface SendWelcomeEmailPorts {
  welcome: WelcomeRepository;
  sender: EmailSender;
  clock: Clock;
  // Base pública de los enlaces (APP_URL), la dirección de la PWA.
  appUrl: string;
  // EMAIL_FROM, para el nombre del remitente en la despedida.
  from?: string;
  // Aviso cuando algo falla: el mensaje nunca lleva el correo ni el nombre.
  log: { warn(message: string): void };
}

// Lo que los otros casos de uso necesitan: avisar que una cuenta acaba de quedar verificada.
export interface WelcomeTrigger {
  execute(accountId: string): Promise<void>;
}

// Los casos de uso no esperan el envío: tardan lo mismo con o sin éxito y no fallan por él (ADR-036).
export function sendWelcomeInBackground(welcome: WelcomeTrigger, accountId: string): void {
  welcome.execute(accountId).catch(() => undefined);
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

// ADR-036: el correo de bienvenida se envía una sola vez por cuenta, cuando su correo queda verificado
// por primera vez. La marca se pone ANTES de enviar y de forma atómica: dos verificaciones a la vez
// envían una sola vez. Si el envío falla no se reintenta (es informativo) y nunca lanza.
export class SendWelcomeEmail implements WelcomeTrigger {
  constructor(private readonly ports: SendWelcomeEmailPorts) {}

  async execute(accountId: string): Promise<void> {
    try {
      const recipient = await this.ports.welcome.claim(accountId, this.ports.clock.now());
      if (!recipient) return;
      const message = welcomeEmail({
        base: withoutTrailingSlashes(this.ports.appUrl),
        displayName: recipient.displayName,
        senderName: senderNameOf(this.ports.from),
      });
      await this.ports.sender.send({ to: recipient.email, ...message });
    } catch (error: unknown) {
      const reason =
        error instanceof EmailSendError
          ? error.message
          : `error inesperado (${error instanceof Error ? error.name : 'desconocido'})`;
      this.ports.log.warn(`No se pudo enviar el correo de bienvenida: ${reason}.`);
    }
  }
}
