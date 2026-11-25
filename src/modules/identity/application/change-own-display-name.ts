import { normalizeDisplayName } from '../../../domain/display-name';
import { type AttemptLimiter, type AttemptRule, TooManyAttemptsError } from './attempt-limiter';
import { AccountGoneError } from './delete-own-account';

export { TooManyAttemptsError } from './attempt-limiter';

// Dato de bajo riesgo, sin contraseña: solo se frena el abuso. Único lugar donde se ajusta el tope.
export const DISPLAY_NAME_CHANGES_PER_ACCOUNT: AttemptRule = { limit: 10, windowMinutes: 60 };
export const displayNameChangeKey = (accountId: string) => `cambiar-nombre:${accountId}`;

// Puerto de escritura: false si la cuenta ya no existe.
export interface DisplayNameWriter {
  changeDisplayName(accountId: string, displayName: string): Promise<boolean>;
}

export interface ChangeOwnDisplayNamePorts {
  names: DisplayNameWriter;
  limiter: AttemptLimiter;
}

export interface ChangeOwnDisplayNameInput {
  accountId: string;
  // La forma ya se validó en la capa HTTP con las reglas de `domain/display-name.ts` (como al registrar).
  displayName: string;
}

// La persona cambia su propio nombre visible (derecho de rectificación, Ley 1581). Solo lo ve su dueña
// (EC-08). Un nombre igual al actual no es un error. Una cuenta anterior al nombre puede ponerse uno.
export class ChangeOwnDisplayName {
  constructor(private readonly ports: ChangeOwnDisplayNamePorts) {}

  async execute(input: ChangeOwnDisplayNameInput): Promise<string> {
    const { names, limiter } = this.ports;
    const key = displayNameChangeKey(input.accountId);
    const wait = limiter.retryAfterSeconds(key, DISPLAY_NAME_CHANGES_PER_ACCOUNT);
    if (wait !== null) throw new TooManyAttemptsError(wait);
    limiter.record(key, DISPLAY_NAME_CHANGES_PER_ACCOUNT);

    const displayName = normalizeDisplayName(input.displayName);
    if (!(await names.changeDisplayName(input.accountId, displayName)))
      throw new AccountGoneError();
    return displayName;
  }
}
