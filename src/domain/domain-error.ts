// Error de una regla del dominio. `code` identifica la regla incumplida con un texto estable
// (por ejemplo, INVALID_QUANTITY); el dominio no sabe nada de HTTP.
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
