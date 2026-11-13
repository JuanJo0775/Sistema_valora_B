import { Argon2PasswordHasher } from '../../src/modules/identity/infrastructure/argon2-password-hasher';

describe('contraseñas con Argon2id (ADR-014)', () => {
  it('calcula un hash Argon2id con los parámetros del grill y lo verifica', async () => {
    const hasher = new Argon2PasswordHasher();

    const hash = await hasher.hash('una-clave-larga');

    // 19 MiB, 2 iteraciones y 1 hilo (grill de la #16, pregunta 7).
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(hasher.verify(hash, 'una-clave-larga')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'otra-clave')).resolves.toBe(false);
  });
});
