import type { Clock } from './clock';
import type { GoogleAccountLinks } from './google-account-links';
import { normalizeEmail } from './register-account';
import type { SessionRepository } from './session-repository';
import { type StartedSession, startSession } from './start-session';

// Lo que Google confirma en el id_token, ya validado por el adaptador (#181).
export interface GoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface SignInWithGooglePorts {
  links: GoogleAccountLinks;
  sessions: SessionRepository;
  clock: Clock;
}

export type SignInWithGoogleResult =
  | ({ outcome: 'signed-in' } & StartedSession)
  // RF-001: la cuenta se crea solo cuando la persona acepta la política (#181, /bienvenida).
  | { outcome: 'needs-policy'; subject: string; email: string; suggestedName: string | null };

// ADR-029, fase 2: sin email_verified no se sabe si el correo es de quien entra.
export class GoogleEmailNotVerifiedError extends Error {
  constructor() {
    super('Google no ha verificado ese correo.');
  }
}

// ADR-029, fase 2 (#180): entrar con una cuenta de Google ya validada.
export class SignInWithGoogle {
  constructor(private readonly ports: SignInWithGooglePorts) {}

  async execute(identity: GoogleIdentity): Promise<SignInWithGoogleResult> {
    if (!identity.emailVerified) throw new GoogleEmailNotVerifiedError();
    const linked = await this.ports.links.findBySubject(identity.subject);
    if (linked) {
      // Misma sesión que el inicio con contraseña (ADR-014).
      return { outcome: 'signed-in', ...(await startSession(this.ports, linked.id)) };
    }
    const email = normalizeEmail(identity.email);
    const existing = await this.ports.links.findByEmail(email);
    if (existing) {
      // ADR-029, fase 2, punto 2: el correo ya tiene cuenta; se vincula y su correo queda verificado.
      await this.ports.links.link({
        accountId: existing.id,
        subject: identity.subject,
        verifiedAt: this.ports.clock.now(),
        forgetPassword: false,
      });
      return { outcome: 'signed-in', ...(await startSession(this.ports, existing.id)) };
    }
    return {
      outcome: 'needs-policy',
      subject: identity.subject,
      email,
      suggestedName: identity.name,
    };
  }
}
