// #133: de dónde sale el nombre visible de una cuenta. Un puerto aparte del repositorio de cuentas:
// solo lo usa la sesión de la propia persona (EC-08).
export interface DisplayNames {
  displayNameOf(accountId: string): Promise<string | null>;
}

export const DISPLAY_NAMES = Symbol('DISPLAY_NAMES');

export interface OwnDisplayNamePorts {
  displayNames: DisplayNames;
}

// El nombre con el que la app saluda a quien inició sesión. Las cuentas creadas antes de #133 no
// tienen nombre.
export class OwnDisplayName {
  constructor(private readonly ports: OwnDisplayNamePorts) {}

  execute(accountId: string): Promise<string | null> {
    return this.ports.displayNames.displayNameOf(accountId);
  }
}
