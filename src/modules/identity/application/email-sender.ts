export interface EmailMessage {
  to: string;
  subject: string;
  // Los mensajes no llevan datos sensibles (ADR-029). El texto plano va siempre: lo usan los lectores
  // de correo que no muestran HTML.
  text: string;
  // La versión con estilo, opcional.
  html?: string;
}

// Puerto de salida del correo (ADR-029). Hoy hay dos adaptadores: ConsoleEmailSender (desarrollo y
// pruebas) y ResendEmailSender (producción); se elige con EMAIL_PROVIDER, como ImageStorage (ADR-022).
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// El proveedor no entregó el mensaje. El texto es nuestro y nunca incluye la clave, el destinatario
// ni el enlace: se puede registrar tal cual.
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
