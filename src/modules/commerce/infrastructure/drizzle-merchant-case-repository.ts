import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  MerchantCase,
  MerchantCaseDecisionRecord,
  MerchantCaseRepository,
} from '../application/merchant-cases';
import { merchantCases } from './schema';

export class DrizzleMerchantCaseRepository implements MerchantCaseRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async hasOpen(establishmentId: string, reporterKey: string): Promise<boolean> {
    const [found] = await this.db
      .select({ id: merchantCases.id })
      .from(merchantCases)
      .where(
        and(
          eq(merchantCases.establishmentId, establishmentId),
          eq(merchantCases.reporterKey, reporterKey),
          eq(merchantCases.status, 'pendiente'),
        ),
      );
    return found !== undefined;
  }

  async open(merchantCase: MerchantCase): Promise<void> {
    await this.db.insert(merchantCases).values(merchantCase);
  }

  // Los pendientes, el más antiguo primero.
  async pending(): Promise<MerchantCase[]> {
    const rows = await this.db
      .select(caseColumns)
      .from(merchantCases)
      .where(eq(merchantCases.status, 'pendiente'))
      .orderBy(asc(merchantCases.createdAt));
    return rows.map(toCase);
  }

  async findPending(caseId: string): Promise<MerchantCase | null> {
    const [row] = await this.db
      .select(caseColumns)
      .from(merchantCases)
      .where(and(eq(merchantCases.id, caseId), eq(merchantCases.status, 'pendiente')));
    return row ? toCase(row) : null;
  }

  async close(record: MerchantCaseDecisionRecord): Promise<void> {
    await this.db
      .update(merchantCases)
      .set({
        status: record.status,
        note: record.note,
        moderatorKey: record.moderatorKey,
        decidedAt: record.decidedAt,
      })
      .where(and(eq(merchantCases.id, record.caseId), eq(merchantCases.status, 'pendiente')));
  }
}

const caseColumns = {
  id: merchantCases.id,
  establishmentId: merchantCases.establishmentId,
  kind: merchantCases.kind,
  reporterKey: merchantCases.reporterKey,
  reason: merchantCases.reason,
  createdAt: merchantCases.createdAt,
};

// La restricción CHECK de la tabla garantiza el tipo.
const toCase = (row: Omit<MerchantCase, 'kind'> & { kind: string }): MerchantCase => ({
  ...row,
  kind: row.kind as MerchantCase['kind'],
});
