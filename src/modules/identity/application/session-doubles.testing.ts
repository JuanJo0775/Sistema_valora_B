import type { NewSession, SessionRepository, StoredSession } from './session-repository';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Guarda las sesiones que se crean; los
// casos de uso que inician sesión (login, restauración, entrar con Google) no buscan, tocan ni revocan.
export class CreatedSessions implements SessionRepository {
  readonly created: NewSession[] = [];

  create(session: NewSession): Promise<void> {
    this.created.push(session);
    return Promise.resolve();
  }

  findByTokenHash(): Promise<StoredSession | null> {
    return Promise.reject(new Error('no se usa al iniciar sesión'));
  }

  touch(): Promise<void> {
    return Promise.reject(new Error('no se usa al iniciar sesión'));
  }

  revoke(): Promise<void> {
    return Promise.reject(new Error('no se usa al iniciar sesión'));
  }
}
