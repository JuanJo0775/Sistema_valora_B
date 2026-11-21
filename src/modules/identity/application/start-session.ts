import { randomUUID } from 'node:crypto';
import { SESSION_MAX_DAYS } from '../../../domain/session-lifetime';
import type { Clock } from './clock';
import type { SessionRepository } from './session-repository';
import { hashSessionToken, newSessionToken } from './session-token';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export interface StartedSession {
  token: string;
  expiresAt: Date;
}

// Grill de la #16, pregunta 3: cada inicio de sesión crea una sesión y un token nuevos. Lo comparten el
// inicio de sesión y la restauración de la cuenta (ADR-032), para que sean idénticos.
export async function startSession(
  ports: { sessions: SessionRepository; clock: Clock },
  accountId: string,
): Promise<StartedSession> {
  const now = ports.clock.now();
  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * DAY_IN_MILLISECONDS);
  await ports.sessions.create({
    id: randomUUID(),
    tokenHash: hashSessionToken(token),
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, expiresAt };
}
