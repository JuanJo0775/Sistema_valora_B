// ADR-033: la base guarda el hash del token del enlace, nunca el token (como la verificación de correo).
export interface NewPasswordReset {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface PasswordCredentials {
  // null: cuenta creada con Google que aún no se creó una contraseña.
  passwordHash: string | null;
}

// Puerto del repositorio de contraseñas: cada método es una sola transacción.
export interface PasswordRepository {
  // En una transacción: invalida los enlaces anteriores sin usar de la cuenta y guarda el nuevo.
  replaceUnused(accountId: string, reset: NewPasswordReset): Promise<void>;
  // Gasta el token de forma atómica: solo si existe, no se ha usado y no ha vencido guarda el hash de la
  // contraseña nueva, marca el correo verificado si no lo estaba, revoca TODAS las sesiones de la cuenta y
  // marca el token usado, juntos. Devuelve la cuenta, o null si el token no sirve (sin decir por qué).
  redeem(input: {
    tokenHash: string;
    passwordHash: string;
    at: Date;
  }): Promise<{ accountId: string } | null>;
  // El hash actual de la contraseña, o null si la cuenta ya no existe.
  credentialsOf(accountId: string): Promise<PasswordCredentials | null>;
  // Guarda el hash nuevo y revoca las sesiones de la cuenta salvo la indicada, juntos.
  changePassword(input: {
    accountId: string;
    passwordHash: string;
    keepSessionId: string;
    at: Date;
  }): Promise<void>;
}

export const PASSWORD_REPOSITORY = Symbol('PASSWORD_REPOSITORY');
