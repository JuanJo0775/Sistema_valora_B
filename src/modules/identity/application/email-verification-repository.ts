// ADR-029: la base guarda el hash del token, nunca el token.
export interface NewEmailVerification {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface StoredEmailVerification extends NewEmailVerification {
  usedAt: Date | null;
}

// A dónde se envía el enlace de una cuenta y si ya no hace falta.
export interface VerificationTarget {
  email: string;
  verified: boolean;
}

// Puerto del repositorio: solo los métodos que los casos de uso usan hoy.
export interface EmailVerificationRepository {
  // En una sola transacción: invalida los enlaces anteriores sin usar de la cuenta y guarda el nuevo.
  // Así nunca quedan dos vigentes, ni con dos reenvíos a la vez.
  replaceUnused(accountId: string, verification: NewEmailVerification): Promise<void>;
  // Consume el token de forma atómica: solo si existe, no se ha usado y no ha vencido lo marca como
  // usado y marca la cuenta como verificada (sin cambiar la fecha de una ya verificada), juntos.
  // Devuelve la cuenta, o null si no sirve (sin decir por qué). Un token se consume una sola vez.
  consume(input: { tokenHash: string; at: Date }): Promise<{ accountId: string } | null>;
  targetOf(accountId: string): Promise<VerificationTarget | null>;
}

export const EMAIL_VERIFICATION_REPOSITORY = Symbol('EMAIL_VERIFICATION_REPOSITORY');
