import { and, asc, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../../../shared/database/database.module';
import type {
  Decision,
  LogEntry,
  ModerationStore,
  NewFlag,
  PendingItem,
} from '../application/stores';
import { toObservation } from './drizzle-stores';
import { flags, moderationLog, observations } from './schema';

type Executor = NodePgDatabase | Transaction;

// Grill de la #32, pregunta 4: aprobar y descartar cambian el estado; observar_cuentas solo se anota.
const STATE_AFTER = { aprobar: 'aprobado', descartar: 'descartado' } as const;

export class DrizzleModerationStore implements ModerationStore {
  constructor(private readonly db: Executor) {}

  async flag(flag: NewFlag): Promise<boolean> {
    const inserted = await this.db
      .insert(flags)
      .values(flag)
      .onConflictDoNothing()
      .returning({ reportId: flags.reportId });
    return inserted.length > 0;
  }

  async pending(): Promise<PendingItem[]> {
    const flagCount = this.db
      .select({ reportId: flags.reportId, total: count().as('total') })
      .from(flags)
      .groupBy(flags.reportId)
      .as('flag_count');
    const rows = await this.db
      .select({
        observation: observations,
        flags: sql<number>`coalesce(${flagCount.total}, 0)`.mapWith(Number),
      })
      .from(observations)
      .leftJoin(flagCount, eq(flagCount.reportId, observations.reportId))
      .where(
        and(
          isNull(observations.moderation),
          or(sql`${observations.verdict}->>'status' = 'sospechoso'`, sql`${flagCount.total} > 0`),
        ),
      );
    return rows.map((row) => ({
      observation: toObservation(row.observation),
      flags: row.flags,
    }));
  }

  async decide(entry: LogEntry): Promise<void> {
    await this.db.insert(moderationLog).values(entry);
    if (entry.decision === 'observar_cuentas') return;
    await this.db
      .update(observations)
      .set({ moderation: STATE_AFTER[entry.decision] })
      .where(eq(observations.reportId, entry.reportId));
  }

  async decisionsAbout(reporterKey: string): Promise<Decision[]> {
    const rows = await this.db
      .select({ decision: moderationLog.decision })
      .from(moderationLog)
      .innerJoin(observations, eq(observations.reportId, moderationLog.reportId))
      .where(eq(observations.reporterKey, reporterKey))
      .orderBy(asc(moderationLog.decidedAt));
    // La restricción CHECK de moderation_log garantiza que es una de las 3 decisiones.
    return rows.map((row) => row.decision as Decision);
  }
}
