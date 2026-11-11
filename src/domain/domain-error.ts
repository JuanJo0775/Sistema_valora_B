// Error de una regla del dominio; el nombre de la clase identifica la regla incumplida.
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
