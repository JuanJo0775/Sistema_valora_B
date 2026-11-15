import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../../../shared/database/database.module';
import type { Observation, ObservationStore, ReputationStore } from '../application/stores';
import { observations, reputationEvents, reputations } from './schema';

// Se usan con la conexión o con la transacción del suscriptor del evento (ADR-015).
type Executor = NodePgDatabase | Transaction;

// Quien escribe la fila garantiza el tipo de precio y el estado de moderación; sin decisión, la
// observación no lleva el campo.
export function toObservation(row: typeof observations.$inferSelect): Observation {
  const { moderation, ...rest } = row;
  return {
    ...rest,
    priceType: row.priceType as Observation['priceType'],
    ...(moderation === null
      ? {}
      : { moderation: moderation as NonNullable<Observation['moderation']> }),
  };
}

export class DrizzleObservationStore implements ObservationStore {
  constructor(private readonly db: Executor) {}

  async forPresentation(
    presentationId: string,
    establishmentIds: string[],
  ): Promise<Observation[]> {
    if (establishmentIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.presentationId, presentationId),
          inArray(observations.establishmentId, establishmentIds),
        ),
      );
    return rows.map(toObservation);
  }

  async save(observation: Observation): Promise<void> {
    await this.db.insert(observations).values(observation).onConflictDoNothing();
  }
}

export class DrizzleReputationStore implements ReputationStore {
  constructor(private readonly db: Executor) {}

  async valuesOf(reporterKeys: string[]): Promise<Map<string, number>> {
    if (reporterKeys.length === 0) return new Map();
    const rows = await this.db
      .select({ reporterKey: reputations.reporterKey, value: reputations.value })
      .from(reputations)
      .where(inArray(reputations.reporterKey, reporterKeys));
    return new Map(rows.map((row) => [row.reporterKey, row.value]));
  }

  async claimPoint(reportId: string, reporterKey: string): Promise<boolean> {
    const claimed = await this.db
      .insert(reputationEvents)
      .values({ reportId, reporterKey, event: 'corroborated' })
      .onConflictDoNothing()
      .returning({ reportId: reputationEvents.reportId });
    return claimed.length > 0;
  }

  async save(reporterKey: string, value: number): Promise<void> {
    await this.db
      .insert(reputations)
      .values({ reporterKey, value })
      .onConflictDoUpdate({
        target: reputations.reporterKey,
        set: { value, updatedAt: sql`now()` },
      });
  }
}
