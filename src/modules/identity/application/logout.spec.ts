import { Logout } from './logout';
import type { SessionRepository } from './session-repository';

const now = new Date('2026-11-12T14:00:00Z');

describe('cerrar sesión', () => {
  it('revoca la sesión en el servidor con la hora actual', async () => {
    const revoked: [string, Date][] = [];
    const sessions: SessionRepository = {
      create: () => Promise.reject(new Error('Logout no crea sesiones')),
      findByTokenHash: () => Promise.reject(new Error('Logout no busca sesiones')),
      touch: () => Promise.reject(new Error('Logout no marca el uso')),
      revoke: (sessionId, at) => {
        revoked.push([sessionId, at]);
        return Promise.resolve();
      },
    };

    await new Logout({ sessions, clock: { now: () => now } }).execute('sesion-1');

    expect(revoked).toEqual([['sesion-1', now]]);
  });
});
