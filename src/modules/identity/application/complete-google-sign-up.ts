import { randomUUID } from 'node:crypto';
import { normalizeDisplayName } from '../../../domain/display-name';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { Clock } from './clock';
import type { GoogleAccountLinks } from './google-account-links';
import type { PendingGoogleSignUp } from './google-handshake';
import { REGISTRATIONS_PER_IP } from './register-account';
import type { SessionRepository } from './session-repository';
import type { SignInWithGoogle } from './sign-in-with-google';
import { type StartedSession, startSession } from './start-session';

export interface CompleteGoogleSignUpPorts {
  links: GoogleAccountLinks;
  sessions: SessionRepository;
  clock: Clock;
  signIn: SignInWithGoogle;
  limiter: AttemptLimiter;
}

export interface CompleteGoogleSignUpInput {
  // Lo que guardó el callback en la cookie firmada: viene de Google, no del cuerpo.
  signUp: PendingGoogleSignUp;
  // #133: ya validado por el DTO con la regla de domain/display-name.
  displayName: string;
  acceptedPolicyVersion: string;
  ip: string;
}

// RF-001 y grill de la #178, pregunta 2 (#181): la cuenta se crea solo al aceptar la política.
export class CompleteGoogleSignUp {
  constructor(private readonly ports: CompleteGoogleSignUpPorts) {}

  async execute(input: CompleteGoogleSignUpInput): Promise<StartedSession> {
    // El mismo tope que el registro con contraseña: 10 por IP en 15 minutos (comparten la clave).
    const ipKey = `registro-ip:${input.ip}`;
    const wait = this.ports.limiter.retryAfterSeconds(ipKey, REGISTRATIONS_PER_IP);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    this.ports.limiter.record(ipKey, REGISTRATIONS_PER_IP);
    // Si mientras tanto el sub o el correo ya tienen cuenta, se entra (o se vincula) como en el
    // callback: nunca se crea una cuenta repetida.
    const existing = await this.signInIfAccountExists(input.signUp);
    if (existing) return existing;
    const { links, clock } = this.ports;
    const now = clock.now();
    const id = randomUUID();
    const created = await links.createLinked({
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
    if (created) return startSession(this.ports, id);
    // Otra petición creó la cuenta entre la búsqueda y la inserción: se vincula a ella.
    const linked = await this.signInIfAccountExists(input.signUp);
    if (!linked) throw new Error('la cuenta con ese correo desapareció a mitad del registro');
    return linked;
  }

  private async signInIfAccountExists(signUp: PendingGoogleSignUp): Promise<StartedSession | null> {
    const result = await this.ports.signIn.execute({
      subject: signUp.subject,
      email: signUp.email,
      // El callback solo guarda el registro pendiente si Google verificó el correo.
      emailVerified: true,
      name: signUp.suggestedName,
    });
    return result.outcome === 'signed-in'
      ? { token: result.token, expiresAt: result.expiresAt }
      : null;
  }
}
