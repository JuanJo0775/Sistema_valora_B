import type { Role } from './account-repository';

// Grill de la #16, pregunta 2: la base guarda el hash del token, nunca el token.
export interface NewSession {
  id: string;
  tokenHash: string;
  accountId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface StoredSession extends NewSession {
  revokedAt: Date | null;
  role: Role;
  // Grill de la #33, pregunta 4: la suspensión de la cuenta dueña de la sesión.
  accountSuspendedUntil: Date | null;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface SessionRepository {
  create(session: NewSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  touch(sessionId: string, at: Date): Promise<void>;
  revoke(sessionId: string, at: Date): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
