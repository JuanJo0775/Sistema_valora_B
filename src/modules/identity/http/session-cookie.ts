import { parseCookie, stringifySetCookie } from 'cookie';

// Nombre del contrato (securitySchemes.sessionCookie).
export const SESSION_COOKIE = 'valora_session';

// Grill de la #16, pregunta 9: HttpOnly, Secure siempre, SameSite=Lax y Path=/.
const ATTRIBUTES = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const;

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) return undefined;
  return parseCookie(cookieHeader)[SESSION_COOKIE];
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: token,
    ...ATTRIBUTES,
    maxAge: maxAgeSeconds,
  });
}

// Al cerrar sesión: la misma cookie, vacía y vencida.
export function clearedSessionCookie(): string {
  return stringifySetCookie({ name: SESSION_COOKIE, value: '', ...ATTRIBUTES, maxAge: 0 });
}

// ADR-029, fase 2 (#181): el saludo con Google (state, nonce y verificador PKCE, firmados). Solo viaja a
// las rutas de Google y dura lo mismo que su vencimiento firmado.
export const GOOGLE_HANDSHAKE_COOKIE = 'valora_google';
const GOOGLE_ATTRIBUTES = { ...ATTRIBUTES, path: '/v1/auth/google' } as const;

export function googleCookie(name: string, value: string, maxAgeSeconds: number): string {
  return stringifySetCookie({ name, value, ...GOOGLE_ATTRIBUTES, maxAge: maxAgeSeconds });
}
