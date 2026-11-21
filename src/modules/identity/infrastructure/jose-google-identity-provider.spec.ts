import { createHash } from 'node:crypto';
import type { GoogleHandshake } from '../application/google-handshake';
import { JoseGoogleIdentityProvider } from './jose-google-identity-provider';

const config = {
  clientId: '1234-abc.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-secreto-de-prueba',
  redirectUri: 'https://www.valoora.app/v1/auth/google/callback',
};
const handshake: GoogleHandshake = {
  state: 'estado-de-prueba',
  nonce: 'nonce-de-prueba',
  codeVerifier: 'v'.repeat(64),
};

// ADR-029, fase 2 (#181): el adaptador de Google con jose v5 y fetch. Sin red: fetch y las claves de
// Google se reemplazan en cada prueba.
describe('adaptador de Google (OpenID Connect con PKCE)', () => {
  it('arma la URL de Google con PKCE S256, state, nonce y los alcances openid email profile', () => {
    const provider = new JoseGoogleIdentityProvider(config);

    const url = new URL(provider.authorizationUrl(handshake));

    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: 'openid email profile',
      state: handshake.state,
      nonce: handshake.nonce,
      code_challenge: createHash('sha256').update(handshake.codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    // El verificador nunca sale del servidor: solo su hash.
    expect(url.toString()).not.toContain(handshake.codeVerifier);
  });
});
