import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import { and, asc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  AccountCredentials,
  AccountDeletionRepository,
  ScheduleOutcome,
} from '../application/account-deletion-repository';
import { accounts, emailVerifications, sessions } from './schema';

// ADR-032. Cada método es una transacción. Las filas que deciden se bloquean con FOR UPDATE, así dos
// peticiones a la vez se turnan y ninguna deja la cuenta a medias.
export class DrizzleAccountDeletionRepository implements AccountDeletionRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async credentialsOf(accountId: string): Promise<AccountCredentials | null> {
    const [found] = await this.db
      .select({ email: accounts.email, passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return found ?? null;
  }

  schedule(input: { accountId: string; scheduledFor: Date; now: Date }): Promise<ScheduleOutcome> {
    return this.db.transaction(async (tx) => {
      const [peek] = await tx
        .select({ role: accounts.role })
        .from(accounts)
        .where(eq(accounts.id, input.accountId));
      if (!peek) return { outcome: 'gone' };

      // Un moderador bloquea a TODOS los moderadores, siempre en el mismo orden (por id): dos moderadores que
      // se eliminan a la vez se turnan sin interbloqueo, y el segundo ve que el primero ya quedó pendiente
      // y no puede dejar la plataforma sin ninguno. Los demás roles solo bloquean su propia fila.
      const locked = await tx
        .select({
          id: accounts.id,
          role: accounts.role,
          deletionScheduledFor: accounts.deletionScheduledFor,
        })
        .from(accounts)
        .where(
          peek.role === 'moderador'
            ? eq(accounts.role, 'moderador')
            : eq(accounts.id, input.accountId),
        )
        .orderBy(asc(accounts.id))
        .for('update');
      const own = locked.find((row) => row.id === input.accountId);
      if (!own) return { outcome: 'gone' };

      // Ya estaba pendiente: la fecha original no se mueve; solo se asegura que no queden sesiones.
      if (own.deletionScheduledFor) {
        await this.revokeSessions(tx, input);
        return { outcome: 'scheduled', scheduledFor: own.deletionScheduledFor };
      }

      if (own.role === 'moderador') {
        const others = locked.filter(
          (row) => row.id !== input.accountId && !row.deletionScheduledFor,
        );
        if (others.length === 0) return { outcome: 'last-moderator' };
      }

      await tx
        .update(accounts)
        .set({ deletionScheduledFor: input.scheduledFor })
        .where(eq(accounts.id, input.accountId));
      await this.revokeSessions(tx, input);
      return { outcome: 'scheduled', scheduledFor: input.scheduledFor };
    });
  }

  private async revokeSessions(
    tx: Pick<NodePgDatabase, 'update'>,
    input: { accountId: string; now: Date },
  ): Promise<void> {
    await tx
      .update(sessions)
      .set({ revokedAt: input.now })
      .where(and(eq(sessions.accountId, input.accountId), isNull(sessions.revokedAt)));
  }

  async cancel(accountId: string): Promise<boolean> {
    const restored = await this.db
      .update(accounts)
      .set({ deletionScheduledFor: null })
      .where(and(eq(accounts.id, accountId), isNotNull(accounts.deletionScheduledFor)))
      .returning({ id: accounts.id });
    return restored.length > 0;
  }

  async dueAccountIds(now: Date, limit: number): Promise<string[]> {
    const due = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(isNotNull(accounts.deletionScheduledFor), lte(accounts.deletionScheduledFor, now)))
      .orderBy(asc(accounts.deletionScheduledFor))
      .limit(limit);
    return due.map((row) => row.id);
  }

  purge(accountId: string, now: Date, events: DomainEvent[]): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Se vuelve a comprobar dentro de la transacción: si la persona restauró la cuenta entre la
      // consulta de pendientes y ahora, no se borra.
      const [due] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, accountId),
            isNotNull(accounts.deletionScheduledFor),
            lte(accounts.deletionScheduledFor, now),
          ),
        )
        .for('update');
      if (!due) return false;
      // Todo lo que cuelga de la cuenta, y después la cuenta. Con ella se va su clave seudónima
      // (accounts.reporter_key): no queda ningún vínculo de la reputación con una persona (ADR-032).
      await tx.delete(sessions).where(eq(sessions.accountId, accountId));
      await tx.delete(emailVerifications).where(eq(emailVerifications.accountId, accountId));
      await tx.delete(accounts).where(eq(accounts.id, accountId));
      for (const event of events) await this.outbox.publish(tx, event);
      return true;
    });
  }
}
