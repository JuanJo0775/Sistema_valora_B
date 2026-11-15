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
  accountSuspendedUntil: null,
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

  it.each([
    ['vencida por inactividad', session({ lastSeenAt: minutesAgo(8 * 24 * 60) }), token],
    ['vencida por el máximo de 30 días', session({ createdAt: minutesAgo(31 * 24 * 60) }), token],
    ['cerrada', session({ revokedAt: minutesAgo(5) }), token],
    ['desconocida', session(), 'otro-token'],
  ])('una sesión %s no da nada y no marca el uso', async (_case, stored, presented) => {
    const { sessions, resolve } = setup(stored);

    await expect(resolve.execute(presented)).resolves.toBeNull();
    expect(sessions.touched).toEqual([]);
  });

  // Grill de la #33, pregunta 4: aunque la sesión siga abierta, la cuenta suspendida no entra.
  it('la sesión de una cuenta suspendida no sirve; terminada la suspensión, sí', async () => {
    const suspended = setup(session({ accountSuspendedUntil: new Date('2026-11-19T14:00:00Z') }));
    const finished = setup(session({ accountSuspendedUntil: minutesAgo(1) }));

    await expect(suspended.resolve.execute(token)).resolves.toBeNull();
    await expect(finished.resolve.execute(token)).resolves.not.toBeNull();
  });
});
