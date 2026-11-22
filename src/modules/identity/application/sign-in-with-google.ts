import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Account } from './account-repository';
import type { Clock } from './clock';
import type { GoogleAccountLinks } from './google-account-links';
import { AccountPendingDeletionError } from './login';
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
  // ADR-033: entrar con Google una cuenta vinculada con la eliminación pendiente la restaura.
  deletion: Pick<AccountDeletionRepository, 'cancel'>;
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

// ADR-032, como el login: durante la gracia no se abre sesión ni se vincula; se dice cuándo se borra.
function rejectPendingDeletion(account: Account): void {
  if (account.deletionScheduledFor) {
    throw new AccountPendingDeletionError(account.deletionScheduledFor);
  }
}

// ADR-029, fase 2 (#180): entrar con una cuenta de Google ya validada.
export class SignInWithGoogle {
  constructor(private readonly ports: SignInWithGooglePorts) {}

  async execute(identity: GoogleIdentity): Promise<SignInWithGoogleResult> {
    if (!identity.emailVerified) throw new GoogleEmailNotVerifiedError();
    const linked = await this.restoreIfPending(
      await this.ports.links.findBySubject(identity.subject),
      identity.subject,
    );
    if (linked) {
      // Misma sesión que el inicio con contraseña (ADR-014).
      return { outcome: 'signed-in', ...(await startSession(this.ports, linked.id)) };
    }
    const email = normalizeEmail(identity.email);
    const existing = await this.ports.links.findByEmail(email);
    if (existing) {
      rejectPendingDeletion(existing);
      // ADR-029, fase 2, punto 2: el correo ya tiene cuenta; se vincula y su correo queda verificado.
      await this.ports.links.link({
        accountId: existing.id,
        subject: identity.subject,
        verifiedAt: this.ports.clock.now(),
        // Grill de la #178, pregunta 4: si nadie había comprobado el correo, quien creó la cuenta pudo no
        // ser su dueña; pierde la contraseña y las sesiones.
        forgetPassword: !existing.emailVerified,
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

  // ADR-033: una cuenta vinculada a este sub de Google con la eliminación pendiente (ADR-032) se restaura al
  // entrar: Google ya probó quién es, y una cuenta creada con Google no tiene contraseña para usar
  // POST /auth/restore-account. Si la purga ganó la carrera (la cuenta ya no existe), sigue como cuenta nueva.
  private async restoreIfPending(
    account: Account | null,
    subject: string,
  ): Promise<Account | null> {
    if (!account?.deletionScheduledFor) return account;
    if (await this.ports.deletion.cancel(account.id)) return account;
    // cancel() es condicional: devolvió false porque otra petición ya restauró la cuenta o la purga la borró.
    return this.ports.links
      .findBySubject(subject)
      .then((again) => (again?.deletionScheduledFor ? null : again));
  }
}
