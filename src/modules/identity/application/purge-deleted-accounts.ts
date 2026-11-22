import { createEvent } from '../../../shared/events';
import type { AccountDeletionRepository } from './account-deletion-repository';
import type { Clock } from './clock';

export interface PurgeDeletedAccountsPorts {
  deletion: AccountDeletionRepository;
  clock: Clock;
}

export interface PurgeResult {
  purged: number;
  failed: number;
}

export const ACCOUNT_PURGED = 'AccountPurged';

// Cuántas cuentas se revisan por pasada; la siguiente sigue con las demás.
const BATCH_SIZE = 100;

// ADR-032: borra de forma definitiva las cuentas cuya fecha de eliminación ya llegó. Es idempotente (borrar
// lo ya borrado no hace nada) y tolera fallos parciales: cada cuenta va en su transacción y una que falle
// no impide las demás; se reintenta en la siguiente pasada. Nunca se adelanta: usa la fecha guardada.
export class PurgeDeletedAccounts {
  constructor(private readonly ports: PurgeDeletedAccountsPorts) {}

  async execute(): Promise<PurgeResult> {
    const { deletion, clock } = this.ports;
    const now = clock.now();
    const due = await deletion.dueAccountIds(now, BATCH_SIZE);
    let purged = 0;
    let failed = 0;
    for (const accountId of due) {
      try {
        // Hallazgo de B7 (#208): los otros módulos borran lo suyo de esa cuenta. Solo el id.
        const events = [createEvent(ACCOUNT_PURGED, 1, { accountId })];
        if (await deletion.purge(accountId, now, events)) purged += 1;
      } catch {
        // No se registra el id de la cuenta; la pasada siguiente lo reintenta.
        failed += 1;
      }
    }
    return { purged, failed };
  }
}
