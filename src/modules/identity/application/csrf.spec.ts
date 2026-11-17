import { csrfTokenFor, isValidCsrfToken } from './csrf';

const secret = 'secreto-de-prueba-suficientemente-largo';

describe('token CSRF derivado de la sesión', () => {
  it('el token de una sesión coincide con ella; el de otra sesión, otro secreto o ninguno, no', () => {
    const token = csrfTokenFor('token-de-sesion-a', secret);

    expect(token).toMatch(/^[\w-]{43}$/);
    expect(isValidCsrfToken(token, 'token-de-sesion-a', secret)).toBe(true);
    expect(isValidCsrfToken(token, 'token-de-sesion-b', secret)).toBe(false);
    expect(
      isValidCsrfToken(
        csrfTokenFor('token-de-sesion-a', 'otro-secreto'),
        'token-de-sesion-a',
        secret,
      ),
    ).toBe(false);
    expect(isValidCsrfToken(undefined, 'token-de-sesion-a', secret)).toBe(false);
    expect(isValidCsrfToken('corto', 'token-de-sesion-a', secret)).toBe(false);
  });
});
