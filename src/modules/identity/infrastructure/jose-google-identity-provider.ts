import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { GoogleHandshake } from '../application/google-handshake';
import {
  GoogleRejectedError,
  type GoogleIdentityProvider,
} from '../application/google-identity-provider';
import type { GoogleIdentity } from '../application/sign-in-with-google';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// Lo que se reemplaza en las pruebas: la red y las claves públicas de Google.
export interface GoogleTransport {
  fetch: typeof fetch;
  keys: JWTVerifyGetKey;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_KEYS = 'https://www.googleapis.com/oauth2/v3/certs';
// Google emite con cualquiera de los dos.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const defaultTransport = (): GoogleTransport => ({
  fetch: (input, init) => fetch(input, init),
  // jose guarda las claves en memoria y las vuelve a pedir cuando Google las rota.
  keys: createRemoteJWKSet(new URL(GOOGLE_KEYS)),
});

// ADR-029, fase 2 (#181), grill de la #178, pregunta 1: jose v5 valida el id_token; el resto es fetch.
export class JoseGoogleIdentityProvider implements GoogleIdentityProvider {
  constructor(
    private readonly config: GoogleClientConfig,
    private readonly transport: GoogleTransport = defaultTransport(),
  ) {}

  authorizationUrl(handshake: GoogleHandshake): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'openid email profile',
      state: handshake.state,
      nonce: handshake.nonce,
      // RFC 7636: Google recibe el hash del verificador; el verificador va solo en el intercambio.
      code_challenge: createHash('sha256').update(handshake.codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  }

  async identityFrom(code: string, handshake: GoogleHandshake): Promise<GoogleIdentity> {
    const idToken = await this.exchange(code, handshake);
    try {
      // Firma con las claves de Google, emisor, destinatario (nuestro cliente) y vencimiento.
      const { payload } = await jwtVerify(idToken, this.transport.keys, {
        issuer: GOOGLE_ISSUERS,
        audience: this.config.clientId,
      });
      // El nonce de la cookie firmada: el token es de este inicio de sesión y no de otro.
      if (payload['nonce'] !== handshake.nonce)
        throw new GoogleRejectedError('el nonce no coincide');
      return {
        subject: String(payload.sub),
        email: String(payload['email']),
        emailVerified: payload['email_verified'] === true,
        name: typeof payload['name'] === 'string' ? payload['name'] : null,
      };
    } catch (error) {
      if (error instanceof GoogleRejectedError) throw error;
      throw new GoogleRejectedError(error instanceof Error ? error.name : 'id_token inválido');
    }
  }

  private async exchange(code: string, handshake: GoogleHandshake): Promise<string> {
    const response = await this.transport.fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code_verifier: handshake.codeVerifier,
      }).toString(),
    });
    // Nunca se registra la respuesta: puede traer tokens.
    if (!response.ok)
      throw new GoogleRejectedError(`el intercambio respondió ${String(response.status)}`);
    const { id_token: idToken } = (await response.json()) as { id_token?: unknown };
    if (typeof idToken !== 'string') throw new GoogleRejectedError('la respuesta no trae id_token');
    return idToken;
  }
}
