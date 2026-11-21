// ADR-033: puerto del proveedor de identidad (hoy Google, por OpenID Connect). El caso de uso no sabe de
// HTTP, claves ni JWT: el adaptador (infrastructure/google-oidc-client.ts) hace el intercambio del código y
// valida el id_token (firma, emisor, audiencia y vencimiento); aquí solo llegan sus datos ya verificados.

export interface GoogleIdentity {
  // `sub`: identificador estable de la persona en Google. No cambia aunque cambie su correo.
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  // El `nonce` que Google devolvió dentro del id_token; el caso de uso lo compara con el guardado.
  nonce: string | null;
}

export interface OidcProvider {
  // Dirección de la pantalla de Google (código de autorización con PKCE S256).
  authorizationUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  // Cambia el código por el id_token y lo valida. Lanza OidcError si algo no cuadra.
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<GoogleIdentity>;
}

export const OIDC_PROVIDER = Symbol('OIDC_PROVIDER');

// Cualquier fallo del intercambio o de la validación. El mensaje es solo para el registro: nunca lleva el
// código, el token ni datos de la persona, y nunca se muestra a quien navega.
export class OidcError extends Error {}
