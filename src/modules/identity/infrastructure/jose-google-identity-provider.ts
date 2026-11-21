import { createHash } from 'node:crypto';
import type { GoogleHandshake } from '../application/google-handshake';
import type { GoogleIdentityProvider } from '../application/google-identity-provider';
import type { GoogleIdentity } from '../application/sign-in-with-google';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// ADR-029, fase 2 (#181), grill de la #178, pregunta 1: jose v5 valida el id_token; el resto es fetch.
export class JoseGoogleIdentityProvider implements GoogleIdentityProvider {
  constructor(private readonly config: GoogleClientConfig) {}

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

  identityFrom(_code: string, _handshake: GoogleHandshake): Promise<GoogleIdentity> {
    return Promise.reject(new Error('el intercambio del código llega en el siguiente ciclo'));
  }
}
