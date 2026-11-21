import { newGoogleHandshake, openHandshake, sealHandshake } from './google-handshake';

const secret = 'secreto-de-sesion-de-prueba';
const now = new Date('2026-11-21T14:00:00Z');

// ADR-029, fase 2 (#181): entre el inicio en /google/start y la vuelta a /google/callback, el servidor
// recuerda state, nonce y el verificador PKCE en una cookie firmada; no guarda nada en la base.
describe('saludo con Google guardado en una cookie firmada', () => {
  it('lo que se sella se abre igual con el mismo secreto', () => {
    const handshake = newGoogleHandshake();

    const sealed = sealHandshake(handshake, secret, now);

    expect(openHandshake(sealed, secret, now)).toEqual(handshake);
  });

  it('si alguien altera la cookie o usa otro secreto, no se abre', () => {
    const sealed = sealHandshake(newGoogleHandshake(), secret, now);
    const [payload, signature] = sealed.split('.');
    const forged = `${Buffer.from('{"state":"mio"}').toString('base64url')}.${signature ?? ''}`;

    expect(openHandshake(forged, secret, now)).toBeNull();
    expect(openHandshake(`${payload ?? ''}.firma-falsa`, secret, now)).toBeNull();
    expect(openHandshake(sealed, 'otro-secreto', now)).toBeNull();
    expect(openHandshake('basura', secret, now)).toBeNull();
  });

  it('cada saludo trae state, nonce y verificador nuevos y difíciles de adivinar', () => {
    const first = newGoogleHandshake();
    const second = newGoogleHandshake();

    expect(first.state).not.toBe(second.state);
    expect(first.nonce).not.toBe(second.nonce);
    // RFC 7636: el verificador PKCE tiene de 43 a 128 caracteres.
    expect(first.codeVerifier).toMatch(/^[\w-]{43,128}$/);
  });
});
