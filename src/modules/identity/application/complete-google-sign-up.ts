import { randomUUID } from 'node:crypto';
import { normalizeDisplayName } from '../../../domain/display-name';
import type { Clock } from './clock';
import type { GoogleAccountLinks } from './google-account-links';
import type { PendingGoogleSignUp } from './google-handshake';
import type { SessionRepository } from './session-repository';
import type { SignInWithGoogle } from './sign-in-with-google';
import { type StartedSession, startSession } from './start-session';

export interface CompleteGoogleSignUpPorts {
  links: GoogleAccountLinks;
  sessions: SessionRepository;
  clock: Clock;
  signIn: SignInWithGoogle;
}

export interface CompleteGoogleSignUpInput {
  // Lo que guardó el callback en la cookie firmada: viene de Google, no del cuerpo.
  signUp: PendingGoogleSignUp;
  // #133: ya validado por el DTO con la regla de domain/display-name.
  displayName: string;
  acceptedPolicyVersion: string;
}

// RF-001 y grill de la #178, pregunta 2 (#181): la cuenta se crea solo al aceptar la política.
export class CompleteGoogleSignUp {
  constructor(private readonly ports: CompleteGoogleSignUpPorts) {}

  async execute(input: CompleteGoogleSignUpInput): Promise<StartedSession> {
    const { links, clock } = this.ports;
    const now = clock.now();
    const id = randomUUID();
    await links.createLinked({
      id,
      email: input.signUp.email,
      displayName: normalizeDisplayName(input.displayName),
      // Grill de la #16, pregunta 5: el registro siempre crea un reportante.
      role: 'reportante',
      policyVersion: input.acceptedPolicyVersion,
      policyAcceptedAt: now,
      googleSubject: input.signUp.subject,
      // Google ya comprobó el correo: no hace falta el enlace de verificación (ADR-029).
      emailVerifiedAt: now,
    });
    return startSession(this.ports, id);
  }
}
