import type { Account, AccountRepository, NewAccount } from './account-repository';
import { type AttemptLimiter, TooManyAttemptsError } from './attempt-limiter';
import type { PasswordHasher } from './password-hasher';
import { RegisterAccount } from './register-account';

const now = new Date('2026-11-12T14:00:00Z');

// Repositorio en memoria: doble del puerto, sin base de datos.
class InMemoryAccountRepository implements AccountRepository {
  readonly accounts: NewAccount[] = [];

  findByEmail(email: string): Promise<Account | null> {
    const found = this.accounts.find((account) => account.email === email);
    return Promise.resolve(found ? { ...found, suspendedUntil: null } : null);
  }

  create(account: NewAccount): Promise<void> {
    this.accounts.push(account);
    return Promise.resolve();
  }

  applyRoleChange(): Promise<void> {
    return Promise.reject(new Error('RegisterAccount no cambia roles'));
  }
}

// Doble rápido de Argon2id: cuenta cuántas veces se calculó un hash.
class FakeHasher implements PasswordHasher {
  hashes = 0;

  hash(password: string): Promise<string> {
    this.hashes += 1;
    return Promise.resolve(`hash:${password}`);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hash:${password}`);
  }
}

// Doble del límite: bloquea las claves indicadas y no cuenta nada más.
const limiterBlocking = (blocked: Record<string, number>): AttemptLimiter => ({
  retryAfterSeconds: (key) => blocked[key] ?? null,
  record: () => undefined,
  reset: () => undefined,
});

function setup(blocked: Record<string, number> = {}) {
  const accounts = new InMemoryAccountRepository();
  const hasher = new FakeHasher();
  const register = new RegisterAccount({
    accounts,
    hasher,
    limiter: limiterBlocking(blocked),
    clock: { now: () => now },
  });
  return { accounts, hasher, register };
}

describe('registrar una cuenta', () => {
  it('crea un reportante con el correo normalizado, el hash de la contraseña y el consentimiento', async () => {
    const { accounts, register } = setup();

    await register.execute({
      email: '  Ana@Correo.com ',
      displayName: '  Ana   María ',
      password: 'una-clave-larga',
      acceptedPolicyVersion: '2026-11',
      ip: '203.0.113.7',
    });

    expect(accounts.accounts).toEqual([
      {
        id: expect.any(String) as unknown,
        email: 'ana@correo.com',
        // #133: el nombre visible, sin espacios sobrantes.
        displayName: 'Ana María',
        passwordHash: 'hash:una-clave-larga',
        role: 'reportante',
        policyVersion: '2026-11',
        policyAcceptedAt: now,
      },
    ]);
  });

  it('con un correo ya registrado da el mismo resultado, no cambia la cuenta y calcula el hash igual', async () => {
    const { accounts, hasher, register } = setup();
    const first = {
      email: 'ana@correo.com',
      displayName: 'Ana',
      password: 'la-primera-clave',
      acceptedPolicyVersion: '2026-11',
      ip: '203.0.113.7',
    };
    await register.execute(first);

    await expect(
      register.execute({ ...first, email: 'ANA@correo.com', password: 'otra-clave-distinta' }),
    ).resolves.toBeUndefined();

    expect(accounts.accounts).toHaveLength(1);
    expect(accounts.accounts[0]?.passwordHash).toBe('hash:la-primera-clave');
    // El segundo registro también calcula el hash: tarda lo mismo que uno nuevo (pregunta 6).
    expect(hasher.hashes).toBe(2);
  });

  it('al pasar el límite de registros por IP responde con los segundos que faltan, sin crear nada', async () => {
    const { accounts, register } = setup({ 'registro-ip:203.0.113.7': 300 });

    const attempt = register.execute({
      email: 'ana@correo.com',
      displayName: 'Ana',
      password: 'una-clave-larga',
      acceptedPolicyVersion: '2026-11',
      ip: '203.0.113.7',
    });

    await expect(attempt).rejects.toThrow(TooManyAttemptsError);
    await expect(attempt).rejects.toMatchObject({ retryAfterSeconds: 300 });
    expect(accounts.accounts).toHaveLength(0);
  });
});
