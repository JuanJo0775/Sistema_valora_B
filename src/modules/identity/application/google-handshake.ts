import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ADR-029, fase 2 (#181): lo que el servidor recuerda entre /google/start y /google/callback.
export interface GoogleHandshake {
  // Protege contra CSRF en el callback: debe volver igual en la URL.
  state: string;
  // Viaja dentro del id_token: evita que se reutilice un token de otro inicio.
  nonce: string;
  // PKCE (RFC 7636): solo quien inició el flujo puede cambiar el código por el token.
  codeVerifier: string;
}

// Tiempo para volver de Google. La cookie lleva el mismo Max-Age, pero el vencimiento va firmado dentro:
// el navegador podría no respetar el Max-Age.
export const GOOGLE_HANDSHAKE_MINUTES = 10;

interface SealedHandshake extends GoogleHandshake {
  // Milisegundos desde 1970: cuándo deja de valer.
  expiresAt: number;
}

const random = (bytes: number) => randomBytes(bytes).toString('base64url');

export function newGoogleHandshake(): GoogleHandshake {
  return { state: random(32), nonce: random(32), codeVerifier: random(48) };
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

// «datos.firma», ambos en base64url. La firma es HMAC-SHA256 con SESSION_SECRET, como el CSRF.
export function sealHandshake(handshake: GoogleHandshake, secret: string, now: Date): string {
  const sealed: SealedHandshake = {
    ...handshake,
    expiresAt: now.getTime() + GOOGLE_HANDSHAKE_MINUTES * 60_000,
  };
  const payload = Buffer.from(JSON.stringify(sealed)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// null si la cookie está mal formada, fue alterada o ya venció.
export function openHandshake(sealed: string, secret: string, now: Date): GoogleHandshake | null {
  const [payload, signature, ...rest] = sealed.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const { expiresAt, ...handshake } = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as SealedHandshake;
  return now.getTime() <= expiresAt ? handshake : null;
}
