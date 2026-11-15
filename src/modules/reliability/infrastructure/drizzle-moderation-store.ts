import { and, asc, count, desc, eq, isNull, notExists, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Transaction } from '../../../shared/database/database.module';
import type {
  AppealRecord,
  Decision,
  LogEntry,
  ModerationStore,
  NewAppeal,
  NewFlag,
  PendingItem,
  Stage,
} from '../application/stores';
import { toObservation } from './drizzle-stores';
import { appeals, flags, moderationLog, observations } from './schema';

type Executor = NodePgDatabase | Transaction;

// Grill de la #32, pregunta 4: aprobar y descartar cambian el estado; observar_cuentas solo se anota.
const STATE_AFTER = { aprobar: 'aprobado', descartar: 'descartado' } as const;

// Las restricciones CHECK de moderation_log garantizan los valores.
const toLogEntry = (row: typeof moderationLog.$inferSelect): LogEntry => ({
  reportId: row.reportId,
  decision: row.decision as Decision,
  note: row.note,
  moderatorKey: row.moderatorKey,
  decidedAt: row.decidedAt,
  stage: row.stage as Stage,
});

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
    const flagsOf = sql<number>`coalesce(${flagCount.total}, 0)`.mapWith(Number);
    const inReview = await this.db
      .select({ observation: observations, flags: flagsOf })
      .from(observations)
      .leftJoin(flagCount, eq(flagCount.reportId, observations.reportId))
      .where(
        and(
          isNull(observations.moderation),
          or(sql`${observations.verdict}->>'status' = 'sospechoso'`, sql`${flagCount.total} > 0`),
        ),
      );
    // Grill de la #71, pregunta 3: las apelaciones que nadie ha decidido.
    const appealed = await this.db
      .select({ observation: observations, flags: flagsOf, appeal: appeals })
      .from(appeals)
      .innerJoin(observations, eq(observations.reportId, appeals.reportId))
      .leftJoin(flagCount, eq(flagCount.reportId, observations.reportId))
      .where(notExists(this.appealDecision(appeals.reportId)));
    return [
      ...inReview.map((row) => ({ observation: toObservation(row.observation), flags: row.flags })),
      ...appealed.map((row) => ({
        observation: toObservation(row.observation),
        flags: row.flags,
        appeal: { note: row.appeal.note, createdAt: row.appeal.createdAt },
      })),
    ];
  }

  async decide(entry: LogEntry): Promise<void> {
    await this.db.insert(moderationLog).values(entry);
    if (entry.decision === 'observar_cuentas') return;
    // Grill de la #71, pregunta 4: rechazar una apelación deja el reporte como estaba (descartado).
    if (entry.stage === 'apelacion' && entry.decision === 'descartar') return;
    await this.db
      .update(observations)
      .set({ moderation: STATE_AFTER[entry.decision] })
      .where(eq(observations.reportId, entry.reportId));
  }

  async decisionsAbout(reporterKey: string): Promise<Decision[]> {
    const rows = await this.db
      .select({
        decision: moderationLog.decision,
        reverted: sql<boolean>`exists (
          select 1 from ${moderationLog} as appeal_decision
          where appeal_decision.report_id = ${moderationLog.reportId}
            and appeal_decision.stage = 'apelacion'
            and appeal_decision.decision = 'aprobar'
        )`,
      })
      .from(moderationLog)
      .innerJoin(observations, eq(observations.reportId, moderationLog.reportId))
      .where(and(eq(observations.reporterKey, reporterKey), eq(moderationLog.stage, 'revision')))
      .orderBy(asc(moderationLog.decidedAt));
    return rows.map((row) =>
      row.decision === 'descartar' && row.reverted ? 'aprobar' : (row.decision as Decision),
    );
  }

  async appeal(appeal: NewAppeal): Promise<boolean> {
    const inserted = await this.db
      .insert(appeals)
      .values(appeal)
      .onConflictDoNothing()
      .returning({ reportId: appeals.reportId });
    return inserted.length > 0;
  }

  async appealOf(reportId: string): Promise<AppealRecord | null> {
    const [found] = await this.db.select().from(appeals).where(eq(appeals.reportId, reportId));
    if (!found) return null;
    const [decided] = await this.appealDecision(reportId);
    const outcome = decided ? (decided.decision === 'aprobar' ? 'aceptada' : 'rechazada') : null;
    return { note: found.note, createdAt: found.createdAt, outcome };
  }

  async revisionOf(reportId: string): Promise<LogEntry | null> {
    const [found] = await this.db
      .select()
      .from(moderationLog)
      .where(and(eq(moderationLog.reportId, reportId), eq(moderationLog.stage, 'revision')))
      .orderBy(desc(moderationLog.decidedAt))
      .limit(1);
    return found ? toLogEntry(found) : null;
  }

  // La decisión sobre la apelación de un reporte, si la hay.
  private appealDecision(reportId: string | typeof appeals.reportId) {
    return this.db
      .select({ decision: moderationLog.decision })
      .from(moderationLog)
      .where(and(eq(moderationLog.reportId, reportId), eq(moderationLog.stage, 'apelacion')));
  }
}
