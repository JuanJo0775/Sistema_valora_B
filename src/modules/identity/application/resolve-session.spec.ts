import { ResolveSession } from './resolve-session';
import type { NewSession, SessionRepository, StoredSession } from './session-repository';
import { hashSessionToken } from './session-token';

const now = new Date('2026-11-12T14:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);
const token = 'token-de-prueba';

const session = (change: Partial<StoredSession> = {}): StoredSession => ({
  id: 'sesion-1',
  tokenHash: hashSessionToken(token),
  accountId: 'cuenta-1',
  role: 'reportante',
  createdAt: minutesAgo(60 * 24),
  lastSeenAt: minutesAgo(10),
  expiresAt: new Date('2026-12-11T14:00:00Z'),
  revokedAt: null,
  ...change,
});

// Repositorio en memoria con una sola sesión guardada; registra cuándo se marcó su uso.
class OneSession implements SessionRepository {
  readonly touched: Date[] = [];

  constructor(private readonly stored: StoredSession) {}

  create(_session: NewSession): Promise<void> {
    return Promise.reject(new Error('ResolveSession no crea sesiones'));
  }

  findByTokenHash(tokenHash: string): Promise<StoredSession | null> {
    return Promise.resolve(tokenHash === this.stored.tokenHash ? this.stored : null);
  }

  touch(_sessionId: string, at: Date): Promise<void> {
    this.touched.push(at);
    return Promise.resolve();
  }

  revoke(): Promise<void> {
    return Promise.reject(new Error('ResolveSession no revoca sesiones'));
  }
}

const setup = (stored: StoredSession) => {
  const sessions = new OneSession(stored);
  return { sessions, resolve: new ResolveSession({ sessions, clock: { now: () => now } }) };
};

describe('resolver la sesión de una petición', () => {
  it('un token válido da la cuenta y su rol, y marca el uso si pasaron 5 minutos', async () => {
    const recent = setup(session({ lastSeenAt: minutesAgo(1) }));
    const older = setup(session({ lastSeenAt: minutesAgo(10) }));

    await expect(recent.resolve.execute(token)).resolves.toEqual({
      sessionId: 'sesion-1',
      accountId: 'cuenta-1',
      role: 'reportante',
    });
    await older.resolve.execute(token);

    expect(recent.sessions.touched).toEqual([]);
    expect(older.sessions.touched).toEqual([now]);
  });
});
