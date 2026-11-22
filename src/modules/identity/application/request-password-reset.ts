import { randomUUID } from 'node:crypto';
import type { AccountRepository } from './account-repository';
import { type AttemptLimiter, type AttemptRule, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import { EmailSendError, type EmailSender } from './email-sender';
import type { PasswordRepository } from './password-repository';
import { passwordResetEmailHtml } from './password-reset-email-html';
import { normalizeEmail } from './register-account';
import { hashVerificationToken, newVerificationToken } from './verification-token';

// ADR-033: el enlace vale 1 hora y se usa una sola vez.
export const PASSWORD_RESET_TTL_HOURS = 1;

// Límites de «olvidé mi contraseña»: 5 por IP en 15 minutos y 3 por correo por hora. Cuentan existan o no
// las cuentas, para que el límite tampoco delate cuáles existen.
export const FORGOT_PER_IP: AttemptRule = { limit: 5, windowMinutes: 15 };
export const FORGOT_PER_EMAIL: AttemptRule = { limit: 3, windowMinutes: 60 };

export const forgotIpKey = (ip: string) => `olvido-ip:${ip}`;
export const forgotEmailKey = (email: string) => `olvido-correo:${email}`;

export interface RequestPasswordResetPorts {
  accounts: AccountRepository;
  passwords: PasswordRepository;
  sender: EmailSender;
  limiter: AttemptLimiter;
  clock: Clock;
  // Base pública de los enlaces (APP_URL), la dirección de la PWA.
  appUrl: string;
  // Aviso cuando algo falla: el mensaje nunca lleva el correo ni el token.
  log: { warn(message: string): void };
}

export interface RequestPasswordResetInput {
  email: string;
  ip: string;
}

// Quita las barras finales de APP_URL sin una expresión regular (SonarQube S8786).
function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

// «Olvidé mi contraseña»: responde igual exista o no la cuenta. Lo que hace de más con una cuenta real
// (guardar el token y enviar el correo) corre en segundo plano, así la respuesta tarda lo mismo y una
// caída del proveedor de correo no cambia lo que ve quien pregunta (como el registro, ADR-029).
export class RequestPasswordReset {
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly ports: RequestPasswordResetPorts) {}

  async execute(input: RequestPasswordResetInput): Promise<void> {
    const { limiter, accounts } = this.ports;
    const email = normalizeEmail(input.email);
    const wait =
      limiter.retryAfterSeconds(forgotIpKey(input.ip), FORGOT_PER_IP) ??
      limiter.retryAfterSeconds(forgotEmailKey(email), FORGOT_PER_EMAIL);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(forgotIpKey(input.ip), FORGOT_PER_IP);
    limiter.record(forgotEmailKey(email), FORGOT_PER_EMAIL);

    const account = await accounts.findByEmail(email);
    // Sin cuenta, o pendiente de eliminación (ADR-032): no se envía nada y la respuesta es la misma.
    if (!account || account.deletionScheduledFor) return;
    const task = this.createAndSend(account.id, email).catch((error: unknown) => {
      const reason =
        error instanceof EmailSendError
          ? error.message
          : `error inesperado (${error instanceof Error ? error.name : 'desconocido'})`;
      this.ports.log.warn(`No se pudo enviar el correo para restablecer la contraseña: ${reason}.`);
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  // Espera lo que quedó en segundo plano (pruebas y apagado ordenado).
  async settled(): Promise<void> {
    await Promise.all([...this.pending]);
  }

  private async createAndSend(accountId: string, email: string): Promise<void> {
    const token = newVerificationToken();
    const now = this.ports.clock.now();
    // Guardar e invalidar los anteriores es una transacción; el envío va después, fuera de ella.
    await this.ports.passwords.replaceUnused(accountId, {
      id: randomUUID(),
      accountId,
      tokenHash: hashVerificationToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000),
    });
    const base = withoutTrailingSlashes(this.ports.appUrl);
    const link = `${base}/restablecer-contrasena?token=${token}`;
    await this.ports.sender.send({
      to: email,
      subject: 'Crea una contraseña nueva en Valora',
      text: [
        'Hola. Pediste restablecer tu contraseña de Valora. Abre este enlace para crear una nueva:',
        '',
        link,
        '',
        `El enlace vence en ${String(PASSWORD_RESET_TTL_HOURS)} hora y solo se puede usar una vez.`,
        'Si tu cuenta entra con Google, este enlace sirve para crear tu primera contraseña.',
        'Si no lo pediste, ignora este mensaje: tu contraseña no cambia.',
      ].join('\n'),
      html: passwordResetEmailHtml({ base, link, validHours: PASSWORD_RESET_TTL_HOURS }),
    });
  }
}
