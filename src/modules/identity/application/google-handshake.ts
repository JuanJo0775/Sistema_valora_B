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

const random = (bytes: number) => randomBytes(bytes).toString('base64url');

export function newGoogleHandshake(): GoogleHandshake {
  return { state: random(32), nonce: random(32), codeVerifier: random(48) };
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

// «datos.firma», ambos en base64url. La firma es HMAC-SHA256 con SESSION_SECRET, como el CSRF, y el
// vencimiento va dentro de los datos firmados.
function seal(data: object, secret: string, now: Date): string {
  const expiresAt = now.getTime() + GOOGLE_HANDSHAKE_MINUTES * 60_000;
  const payload = Buffer.from(JSON.stringify({ ...data, expiresAt })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// null si la cookie está mal formada, fue alterada o ya venció.
function open(sealed: string, secret: string, now: Date): object | null {
  const [payload, signature, ...rest] = sealed.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  const { expiresAt, ...data } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    expiresAt: number;
  };
  return now.getTime() <= expiresAt ? data : null;
}

export const sealHandshake = (handshake: GoogleHandshake, secret: string, now: Date) =>
  seal(handshake, secret, now);

export const openHandshake = (sealed: string, secret: string, now: Date) =>
  open(sealed, secret, now) as GoogleHandshake | null;

// RF-001 (#181): quien entró con Google y aún no tiene cuenta. El callback lo guarda en otra cookie
// firmada hasta que acepte la política en /bienvenida; el correo nunca viaja por la URL (EC-08).
export interface PendingGoogleSignUp {
  subject: string;
  email: string;
  suggestedName: string | null;
}

export const sealSignUp = (signUp: PendingGoogleSignUp, secret: string, now: Date) =>
  seal(signUp, secret, now);
