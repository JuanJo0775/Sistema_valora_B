import { seedModerator } from './seed-moderator';

const EMAIL = 'Moderador@Ejemplo.Test';

type Existing = { role: 'reportante' | 'moderador' } | null;

function setup(existing: Existing) {
  const calls = { register: 0, changeRole: [] as string[] };
  let current = existing;
  return {
    calls,
    ports: {
      accounts: { findByEmail: () => Promise.resolve(current as never) },
      register: {
        execute: () => {
          calls.register += 1;
          current = { role: 'reportante' };
          return Promise.resolve();
        },
      },
      changeRole: {
        execute: ({ role }: { role: string }) => {
          calls.changeRole.push(role);
          return Promise.resolve();
        },
      },
    },
  };
}

describe('seedModerator', () => {
  it('crea la cuenta y la sube a moderador', async () => {
    const { ports, calls } = setup(null);
    const message = await seedModerator({ email: EMAIL, password: 'una-clave-larga-123' }, ports);
    expect(calls.register).toBe(1);
    expect(calls.changeRole).toEqual(['moderador']);
    expect(message).toContain('creada');
    expect(message).not.toContain('ejemplo');
  });

  it('no crea ni cambia nada si ya es moderador', async () => {
    const { ports, calls } = setup({ role: 'moderador' });
    const message = await seedModerator({ email: EMAIL, password: undefined }, ports);
    expect(calls.register).toBe(0);
    expect(calls.changeRole).toEqual([]);
    expect(message).toContain('ya existía');
  });

  it('exige una contraseña de al menos 10 caracteres para crear la cuenta', async () => {
    const { ports, calls } = setup(null);
    await expect(seedModerator({ email: EMAIL, password: 'corta' }, ports)).rejects.toThrow(
      'SEED_MODERATOR_PASSWORD',
    );
    expect(calls.register).toBe(0);
  });

  it('exige el correo por entorno', async () => {
    const { ports } = setup(null);
    await expect(
      seedModerator({ email: undefined, password: 'una-clave-larga-123' }, ports),
    ).rejects.toThrow('SEED_MODERATOR_EMAIL');
  });
});
