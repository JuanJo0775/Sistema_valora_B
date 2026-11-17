// Puerto hacia Argon2id (ADR-014): las pruebas unitarias usan un doble rápido.
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
