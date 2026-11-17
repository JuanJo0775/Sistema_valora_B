import { type EmailMessage, EmailSendError, type EmailSender } from '../application/email-sender';

const RESEND_URL = 'https://api.resend.com/emails';

export interface ResendEmailSenderOptions {
  apiKey: string;
  // Remitente verificado en Resend, por ejemplo «Valora <no-responder@dominio>».
  from: string;
  // Para las pruebas; en producción es el fetch de Node (sin dependencias nuevas).
  fetch?: typeof fetch;
}

// ADR-029: adaptador de producción. Falla con un EmailSendError cuyo texto no incluye la clave, el
// destinatario, el enlace ni el cuerpo de la respuesta del proveedor.
export class ResendEmailSender implements EmailSender {
  constructor(private readonly options: ResendEmailSenderOptions) {}

  async send(message: EmailMessage): Promise<void> {
    const doFetch = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await doFetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Se descarta el error original: su texto podría traer datos de la petición.
      throw new EmailSendError('no se pudo conectar con el proveedor de correo');
    }
    // No se lee el cuerpo (podría traer datos): se cancela para liberar la conexión.
    await response.body?.cancel();
    if (!response.ok) {
      throw new EmailSendError(`el proveedor de correo respondió ${String(response.status)}`);
    }
  }
}
