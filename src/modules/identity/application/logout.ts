import type { Clock } from './clock';
import type { SessionRepository } from './session-repository';

export interface LogoutPorts {
  sessions: SessionRepository;
  clock: Clock;
}

// Grill de la #16, pregunta 3: cerrar sesión marca revoked_at; la sesión deja de servir.
export class Logout {
  constructor(private readonly ports: LogoutPorts) {}

  execute(sessionId: string): Promise<void> {
    return this.ports.sessions.revoke(sessionId, this.ports.clock.now());
  }
}
