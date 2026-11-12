import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent, OutboxPublisher } from '../../../shared/events';
import type {
  NewReport,
  PriceType,
  ReportRepository,
  SavedReport,
} from '../application/report-repository';
import { reports } from './schema';

type ReportRow = typeof reports.$inferSelect;

function toNewReport(row: ReportRow): NewReport {
  return {
    id: row.id,
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
  async save(report: NewReport, event: DomainEvent): Promise<SavedReport> {
    return this.db.transaction(async (tx) => {
      await tx.insert(reports).values(report);
      await this.outbox.publish(tx, event);
      return { report, created: true };
    });
  }
}
