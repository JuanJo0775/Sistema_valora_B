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
  // Invalida los enlaces anteriores sin usar de la cuenta.
  deleteUnusedOf(accountId: string): Promise<void>;
  create(verification: NewEmailVerification): Promise<void>;
  findByTokenHash(
    tokenHash: string,
  ): Promise<(StoredEmailVerification & { accountVerified: boolean }) | null>;
  // Marca el token como usado y la cuenta como verificada, juntos. No cambia la fecha de una cuenta
  // que ya estaba verificada.
  complete(input: { verificationId: string; accountId: string; at: Date }): Promise<void>;
  targetOf(accountId: string): Promise<VerificationTarget | null>;
}

export const EMAIL_VERIFICATION_REPOSITORY = Symbol('EMAIL_VERIFICATION_REPOSITORY');
