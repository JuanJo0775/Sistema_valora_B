// ADR-032: lo que la eliminación de cuenta necesita guardar y borrar. Cada método es una sola
// transacción: nunca queda una cuenta a medio borrar.

export type ScheduleOutcome =
  // La cuenta quedó pendiente (o ya lo estaba: la fecha original no se mueve) y sin sesiones.
  | { outcome: 'scheduled'; scheduledFor: Date }
  // Es el único moderador que queda: no puede irse.
  | { outcome: 'last-moderator' }
  // La cuenta ya no existe (otra petición la purgó).
  | { outcome: 'gone' };

export interface AccountDeletionRepository {
  // Lo que prueba que quien pide eliminar es el dueño: el hash de su contraseña (null si la cuenta es de
  // Google y no tiene), o null si la cuenta ya no existe.
  credentialsOf(accountId: string): Promise<{ passwordHash: string | null } | null>;
  // Marca la cuenta pendiente de eliminación y revoca todas sus sesiones, juntos. Con dos peticiones a la
  // vez, las filas se bloquean: la segunda ve la fecha de la primera y no la mueve.
  schedule(input: { accountId: string; scheduledFor: Date; now: Date }): Promise<ScheduleOutcome>;
  // Cancela la eliminación; false si la cuenta no estaba pendiente (o ya no existe).
  cancel(accountId: string): Promise<boolean>;
  // Cuentas pendientes cuya fecha ya llegó, las más antiguas primero.
  dueAccountIds(now: Date, limit: number): Promise<string[]>;
  // Borra la cuenta y todo lo que cuelga de ella (sesiones, enlaces de verificación e identidades externas) si sigue pendiente y
  // ya venció; false si no (restaurada, ya borrada o aún no vence).
  purge(accountId: string, now: Date): Promise<boolean>;
}

export const ACCOUNT_DELETION_REPOSITORY = Symbol('ACCOUNT_DELETION_REPOSITORY');
