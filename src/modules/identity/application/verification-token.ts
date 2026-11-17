import { createHash, randomBytes } from 'node:crypto';

// Token aleatorio de 256 bits en base64url: es lo único que viaja en el enlace del correo.
export function newVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

// SHA-256 del token: lo que se guarda y se busca en la base (nunca el token en claro).
export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
