import { and, asc, eq, gt, gte, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type {
  NewReport,
  PriceType,
  RecentReport,
  ReportRepository,
  SavedReport,
} from '../application/report-repository';
import { reports } from './schema';

type ReportRow = typeof reports.$inferSelect;

function toNewReport(row: ReportRow): NewReport {
  return {
    id: row.id,
    // Los reportes anteriores a la #16 no tienen reportante (grill de la #16, pregunta 8).
    reporterId: row.reporterId ?? '',
    presentationId: row.presentationId,
    establishmentId: row.establishmentId,
    priceCop: row.priceCop,
    // La restricción CHECK de la tabla garantiza que es uno de los tipos permitidos.
    priceType: row.priceType as PriceType,
    observedAt: row.observedAt,
    receivedAt: row.receivedAt,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
  };
}

export class DrizzleReportRepository implements ReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly outbox: OutboxPublisher,
  ) {}

  async findByIdempotencyKey(key: string): Promise<NewReport | null> {
    const [row] = await this.db.select().from(reports).where(eq(reports.idempotencyKey, key));
    return row ? toNewReport(row) : null;
  }

  // ADR-015: el reporte y su evento se confirman juntos o no se guarda ninguno.
  // Si otra solicitud ya guardó la misma clave, PostgreSQL espera a que confirme, no inserta nada
  // y se devuelve el reporte que quedó guardado (grill de la #14, pregunta 6).
  async save(report: NewReport, events: DomainEvent[]): Promise<SavedReport> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(reports)
        .values(report)
        .onConflictDoNothing({ target: reports.idempotencyKey })
        .returning({ id: reports.id });
      if (inserted.length > 0) {
        for (const event of events) await this.outbox.publish(tx, event);
        return { report, created: true };
      }
      const [stored] = await tx
        .select()
        .from(reports)
        .where(eq(reports.idempotencyKey, report.idempotencyKey));
      if (!stored) throw new Error('El reporte con esta clave no se encontró tras el conflicto.');
      return { report: toNewReport(stored), created: false };
    });
  }

  async recentOf(reporterId: string, since: Date): Promise<RecentReport[]> {
    return this.db
      .select({
        id: reports.id,
        presentationId: reports.presentationId,
        establishmentId: reports.establishmentId,
        observedAt: reports.observedAt,
        receivedAt: reports.receivedAt,
      })
      .from(reports)
      .where(and(eq(reports.reporterId, reporterId), gt(reports.receivedAt, since)))
      .orderBy(asc(reports.receivedAt));
  }

  async observedBetween(reporterId: string, from: Date, to: Date): Promise<RecentReport[]> {
    return this.db
      .select({
        id: reports.id,
        presentationId: reports.presentationId,
        establishmentId: reports.establishmentId,
        observedAt: reports.observedAt,
        receivedAt: reports.receivedAt,
      })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, reporterId),
          gte(reports.observedAt, from),
          lte(reports.observedAt, to),
        ),
      )
      .orderBy(asc(reports.observedAt));
  }
}
