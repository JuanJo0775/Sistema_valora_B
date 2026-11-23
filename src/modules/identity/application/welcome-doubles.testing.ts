import type { WelcomeTrigger } from './send-welcome-email';
import type { WelcomeRecipient, WelcomeRepository } from './welcome-repository';

// Solo para pruebas (tsconfig.build.json excluye *.testing.ts). Cuentas en memoria para la bienvenida:
// claim es atómico como el UPDATE real (sin esperas entre mirar y marcar).
export class InMemoryWelcome implements WelcomeRepository {
  readonly accounts = new Map<
    string,
    {
      email: string;
      displayName: string | null;
      verifiedAt: Date | null;
      welcomeSentAt: Date | null;
    }
  >();

  claim(accountId: string, at: Date): Promise<WelcomeRecipient | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.verifiedAt === null || account.welcomeSentAt !== null) {
      return Promise.resolve(null);
    }
    account.welcomeSentAt = at;
    return Promise.resolve({ email: account.email, displayName: account.displayName });
  }
}

// Registra las cuentas a las que se pidió la bienvenida; con `failWith` simula un fallo que escapa.
export class RecordingWelcome implements WelcomeTrigger {
  readonly requested: string[] = [];
  failWith: Error | null = null;

  execute(accountId: string): Promise<void> {
    this.requested.push(accountId);
    return this.failWith ? Promise.reject(this.failWith) : Promise.resolve();
  }
}

// Deja correr las tareas pendientes (el envío va en segundo plano).
export const flushBackground = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });
