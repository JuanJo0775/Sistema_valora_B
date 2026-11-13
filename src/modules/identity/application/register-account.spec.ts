import type { Account, AccountRepository, NewAccount } from './account-repository';
import type { PasswordHasher } from './password-hasher';
import { RegisterAccount } from './register-account';

const now = new Date('2026-11-12T14:00:00Z');

// Repositorio en memoria: doble del puerto, sin base de datos.
class InMemoryAccountRepository implements AccountRepository {
  readonly accounts: NewAccount[] = [];

  findByEmail(email: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.find((account) => account.email === email) ?? null);
  }

  create(account: NewAccount): Promise<void> {
    this.accounts.push(account);
    return Promise.resolve();
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

function setup() {
  const accounts = new InMemoryAccountRepository();
  const hasher = new FakeHasher();
  const register = new RegisterAccount({ accounts, hasher, clock: { now: () => now } });
  return { accounts, hasher, register };
}

describe('registrar una cuenta', () => {
  it('crea un reportante con el correo normalizado, el hash de la contraseña y el consentimiento', async () => {
    const { accounts, register } = setup();

    await register.execute({
      email: '  Ana@Correo.com ',
      password: 'una-clave-larga',
      acceptedPolicyVersion: '2026-11',
    });

    expect(accounts.accounts).toEqual([
      {
        id: expect.any(String) as unknown,
        email: 'ana@correo.com',
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
      password: 'la-primera-clave',
      acceptedPolicyVersion: '2026-11',
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
});
