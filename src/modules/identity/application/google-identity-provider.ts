import type { GoogleHandshake } from './google-handshake';
import type { GoogleIdentity } from './sign-in-with-google';

// ADR-029, fase 2 (#181): puerto hacia Google. El adaptador real usa jose v5 y fetch; las pruebas de
// las rutas usan un doble.
export interface GoogleIdentityProvider {
  // Adónde se manda a la persona para que elija su cuenta de Google.
  authorizationUrl(handshake: GoogleHandshake): string;
  // Cambia el código del callback por la identidad validada. Lanza GoogleRejectedError si Google no
  // la confirma (código inválido, id_token mal firmado, de otro cliente, vencido o con otro nonce).
  identityFrom(code: string, handshake: GoogleHandshake): Promise<GoogleIdentity>;
}

export class GoogleRejectedError extends Error {
  constructor(reason: string) {
    super(`Google no confirmó la identidad: ${reason}.`);
  }
}

export const GOOGLE_IDENTITY_PROVIDER = Symbol('GOOGLE_IDENTITY_PROVIDER');
