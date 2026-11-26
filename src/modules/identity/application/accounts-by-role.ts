import type { Role } from './account-repository';

export interface AccountsWithRole {
  idsWithRole(role: Role): Promise<string[]>;
}

// #260: la consulta pública de identity para saber quién tiene un rol. Solo ids: nunca el correo ni
// ningún dato de la persona (EC-08); notifications la usa para avisar a los moderadores.
export class AccountsByRole {
  constructor(private readonly accounts: AccountsWithRole) {}

  ids(role: Role): Promise<string[]> {
    return this.accounts.idsWithRole(role);
  }
}
