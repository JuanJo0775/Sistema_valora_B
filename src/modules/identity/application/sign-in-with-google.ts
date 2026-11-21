import type { Clock } from './clock';
import type { GoogleAccountLinks } from './google-account-links';
import type { SessionRepository } from './session-repository';

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

// ADR-029, fase 2: sin email_verified no se sabe si el correo es de quien entra.
export class GoogleEmailNotVerifiedError extends Error {
  constructor() {
    super('Google no ha verificado ese correo.');
  }
}

// ADR-029, fase 2 (#180): entrar con una cuenta de Google ya validada.
export class SignInWithGoogle {
  constructor(private readonly ports: SignInWithGooglePorts) {}

  execute(identity: GoogleIdentity): Promise<void> {
    if (!identity.emailVerified) return Promise.reject(new GoogleEmailNotVerifiedError());
    return Promise.resolve();
  }
}
