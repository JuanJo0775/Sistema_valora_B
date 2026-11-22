import type { DomainEvent } from '../../../shared/events';

// ADR-032: lo que la eliminación de cuenta necesita guardar y borrar. Cada método es una sola
// transacción: nunca queda una cuenta a medio borrar.

export type ScheduleOutcome =
  // La cuenta quedó pendiente (o ya lo estaba: la fecha original no se mueve) y sin sesiones.
  | { outcome: 'scheduled'; scheduledFor: Date }
  // Es el único moderador que queda: no puede irse.
  | { outcome: 'last-moderator' }
  // La cuenta ya no existe (otra petición la purgó).
  | { outcome: 'gone' };

export interface AccountCredentials {
  email: string;
  passwordHash: string | null;
}

export interface AccountDeletionRepository {
  // Lo que confirma la eliminación: el correo y el hash de la contraseña (null si la cuenta se creó con
  // Google, #179). null si la cuenta ya no existe.
  credentialsOf(accountId: string): Promise<AccountCredentials | null>;
  // Marca la cuenta pendiente de eliminación y revoca todas sus sesiones, juntos. Con dos peticiones a la
  // vez, las filas se bloquean: la segunda ve la fecha de la primera y no la mueve.
  schedule(input: { accountId: string; scheduledFor: Date; now: Date }): Promise<ScheduleOutcome>;
  // Cancela la eliminación; false si la cuenta no estaba pendiente (o ya no existe).
  cancel(accountId: string): Promise<boolean>;
  // Cuentas pendientes cuya fecha ya llegó, las más antiguas primero.
  dueAccountIds(now: Date, limit: number): Promise<string[]>;
  // Borra la cuenta y todo lo que cuelga de ella (sesiones y enlaces de verificación) si sigue pendiente y
  // ya venció, con sus eventos en la misma transacción (ADR-015); false si no (restaurada, ya borrada o
  // aún no vence), y entonces no guarda los eventos.
  purge(accountId: string, now: Date, events: DomainEvent[]): Promise<boolean>;
}

export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY');
