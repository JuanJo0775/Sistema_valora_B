import { isSessionActive, needsTouch } from '../../../domain/session-lifetime';
import type { Role, SuspensionReason } from './account-repository';
import type { Clock } from './clock';
import type { SessionRepository } from './session-repository';
import { hashSessionToken } from './session-token';

export interface ResolveSessionPorts {
  sessions: SessionRepository;
  clock: Clock;
}

// Lo que el resto de la aplicación sabe de quien hace la petición: nunca el correo (EC-08).
export interface ActiveSession {
  sessionId: string;
  accountId: string;
  role: Role;
  // ADR-029: registrar precios exige el correo verificado.
  emailVerified: boolean;
  // ADR-033: cuándo se abrió esta sesión; crear una contraseña o eliminar una cuenta de Google exige que sea
  // reciente.
  createdAt: Date;
  // ADR-033: si la cuenta tiene contraseña.
  hasPassword: boolean;
  // Grill de la #71, pregunta 5: solo si la cuenta está suspendida; la sesión queda limitada.
  suspendedUntil?: Date;
  // H33: la causa de la suspensión, solo si la cuenta está suspendida.
  suspensionReason?: SuspensionReason;
}

export class ResolveSession {
  constructor(private readonly ports: ResolveSessionPorts) {}

  async execute(token: string): Promise<ActiveSession | null> {
    const session = await this.ports.sessions.findByTokenHash(hashSessionToken(token));
    const now = this.ports.clock.now();
    // Grill de la #16, pregunta 3: vencida por inactividad o por el máximo, o cerrada, no sirve.
    if (!session || !isSessionActive({ ...session, now })) return null;
    if (needsTouch(session.lastSeenAt, now)) await this.ports.sessions.touch(session.id, now);
    const suspendedUntil = session.accountSuspendedUntil;
    return {
      sessionId: session.id,
      accountId: session.accountId,
      role: session.role,
      emailVerified: session.accountEmailVerifiedAt !== null,
      createdAt: session.createdAt,
      hasPassword: session.accountHasPassword,
      ...(suspendedUntil && suspendedUntil > now
        ? {
            suspendedUntil,
            suspensionReason: session.accountSuspensionReason ?? 'no_registrada',
          }
        : {}),
    };
  }
}
