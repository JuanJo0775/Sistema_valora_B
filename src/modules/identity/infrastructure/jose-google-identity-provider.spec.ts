import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, type KeyLike, SignJWT } from 'jose';
import type { GoogleHandshake } from '../application/google-handshake';
import { GoogleRejectedError } from '../application/google-identity-provider';
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

  describe('cambiar el código por la identidad', () => {
    let googleKey: KeyLike;
    let otherKey: KeyLike;
    let keys: ReturnType<typeof createLocalJWKSet>;
    const now = Math.floor(Date.now() / 1000);

    beforeAll(async () => {
      const google = await generateKeyPair('RS256');
      googleKey = google.privateKey;
      otherKey = (await generateKeyPair('RS256')).privateKey;
      keys = createLocalJWKSet({
        keys: [{ ...(await exportJWK(google.publicKey)), kid: 'google-1', alg: 'RS256' }],
      });
    });

    const claims = {
      iss: 'https://accounts.google.com',
      aud: config.clientId,
      sub: '109876543210987654321',
      email: 'ana@correo.com',
      email_verified: true,
      name: 'Ana María',
      nonce: handshake.nonce,
      iat: now,
      exp: now + 3600,
    };
    const idToken = (change: Record<string, unknown> = {}, key = () => googleKey) =>
      new SignJWT({ ...claims, ...change })
        .setProtectedHeader({ alg: 'RS256', kid: 'google-1' })
        .sign(key());

    // fetch simulado del endpoint de tokens de Google: guarda lo que se le pidió.
    function googleReturning(token: Promise<string>, status = 200) {
      const calls: { url: string; body: URLSearchParams }[] = [];
      const fetchFn: typeof fetch = async (url, init) => {
        const target = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;
        const body = typeof init?.body === 'string' ? init.body : '';
        calls.push({ url: target, body: new URLSearchParams(body) });
        return new Response(JSON.stringify({ id_token: await token }), { status });
      };
      const provider = new JoseGoogleIdentityProvider(config, { fetch: fetchFn, keys });
      return { provider, calls };
    }

    it('con un id_token válido devuelve la identidad y manda el verificador PKCE, no el hash', async () => {
      const { provider, calls } = googleReturning(idToken());

      await expect(provider.identityFrom('codigo-de-google', handshake)).resolves.toEqual({
        subject: '109876543210987654321',
        email: 'ana@correo.com',
        emailVerified: true,
        name: 'Ana María',
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
      expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({
        grant_type: 'authorization_code',
        code: 'codigo-de-google',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code_verifier: handshake.codeVerifier,
      });
    });

    it.each([
      [
        'es de otro cliente (aud ajeno)',
        () => idToken({ aud: 'otro-cliente.apps.googleusercontent.com' }),
      ],
      ['no lo emitió Google (iss ajeno)', () => idToken({ iss: 'https://evil.example' })],
      ['ya venció', () => idToken({ iat: now - 7200, exp: now - 3600 })],
      ['está firmado con otra clave', () => idToken({}, () => otherKey)],
    ])('rechaza un id_token que %s', async (_case, token) => {
      const { provider } = googleReturning(token());

      await expect(provider.identityFrom('codigo', handshake)).rejects.toThrow(GoogleRejectedError);
    });

    it('si Google rechaza el código (código usado o vencido), lo rechaza', async () => {
      const { provider } = googleReturning(Promise.resolve('sin-token'), 400);

      await expect(provider.identityFrom('codigo-usado', handshake)).rejects.toThrow(
        GoogleRejectedError,
      );
    });
  });
});
