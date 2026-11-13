import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../application/password-hasher';

// Grill de la #16, pregunta 7: mínimo de OWASP para Argon2id, en un solo lugar para calibrarlo.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
