// ADR-036: a quién se le envía el correo de bienvenida.
export interface WelcomeRecipient {
  email: string;
  // Puede faltar en las cuentas anteriores al nombre visible (#133).
  displayName: string | null;
}

export interface WelcomeRepository {
  // Marca la bienvenida como enviada y devuelve el destinatario, en un solo UPDATE atómico, o null si no
  // toca enviarla: la cuenta no existe, su correo no está verificado o ya se marcó antes. De dos llamadas
  // a la vez, solo una recibe el destinatario.
  claim(accountId: string, at: Date): Promise<WelcomeRecipient | null>;
}

export const WELCOME_REPOSITORY = Symbol('WELCOME_REPOSITORY');
