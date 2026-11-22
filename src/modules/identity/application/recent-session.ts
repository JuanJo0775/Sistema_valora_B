// ADR-033: una cuenta sin contraseña (creada con Google) no puede demostrar que es suya con una
// contraseña; para crearla o para eliminar la cuenta, su sesión debe haberse abierto hace poco.
export const RECENT_SESSION_MINUTES = 10;

export function isRecentSession(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= RECENT_SESSION_MINUTES * 60 * 1000;
}

// 403 REAUTH_REQUIRED: el frontend pide volver a entrar con Google.
export class ReauthRequiredError extends Error {
  constructor() {
    super('Vuelve a iniciar sesión para continuar.');
  }
}
