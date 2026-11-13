import { createHmac, timingSafeEqual } from 'node:crypto';

// Grill de la #16, pregunta 4: HMAC-SHA256 del token de sesión con SESSION_SECRET. No se guarda:
// se vuelve a calcular en cada petición, y rota con la sesión.
export function csrfTokenFor(sessionToken: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionToken).digest('base64url');
}

// Comparación en tiempo constante; un token ausente o de otro largo no coincide.
export function isValidCsrfToken(
  presented: string | undefined,
  sessionToken: string,
  secret: string,
): boolean {
  if (presented === undefined) return false;
  const expected = Buffer.from(csrfTokenFor(sessionToken, secret));
  const received = Buffer.from(presented);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
