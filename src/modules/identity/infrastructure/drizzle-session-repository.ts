import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Role } from '../application/account-repository';
import type {
  NewSession,
  SessionRepository,
  StoredSession,
} from '../application/session-repository';
import { accounts, sessions } from './schema';

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async create(session: NewSession): Promise<void> {
    await this.db.insert(sessions).values(session);
  }

  async findByTokenHash(tokenHash: string): Promise<StoredSession | null> {
    const [found] = await this.db
      .select({
        id: sessions.id,
        tokenHash: sessions.tokenHash,
        accountId: sessions.accountId,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        role: accounts.role,
      })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.accountId, accounts.id))
      .where(eq(sessions.tokenHash, tokenHash));
    // La restricción CHECK de accounts garantiza que es uno de los 3 roles.
    return found ? { ...found, role: found.role as Role } : null;
  }

  async touch(sessionId: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt: at }).where(eq(sessions.id, sessionId));
  }

  async revoke(sessionId: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: at }).where(eq(sessions.id, sessionId));
  }

  // Grill de la #33, pregunta 4: al suspender una cuenta se cierran todas sus sesiones abiertas.
  async revokeAllOf(accountId: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)));
  }
}
