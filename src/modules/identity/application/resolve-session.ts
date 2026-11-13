import { needsTouch } from '../../../domain/session-lifetime';
import type { Role } from './account-repository';
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
}

export class ResolveSession {
  constructor(private readonly ports: ResolveSessionPorts) {}

  async execute(token: string): Promise<ActiveSession | null> {
    const session = await this.ports.sessions.findByTokenHash(hashSessionToken(token));
    if (!session) return null;
    const now = this.ports.clock.now();
    if (needsTouch(session.lastSeenAt, now)) await this.ports.sessions.touch(session.id, now);
    return { sessionId: session.id, accountId: session.accountId, role: session.role };
  }
}
