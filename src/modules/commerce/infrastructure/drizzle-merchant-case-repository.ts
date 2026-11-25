import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  MerchantCase,
  MerchantCaseDecisionRecord,
  MerchantCaseRepository,
  NewDisputeChallenger,
} from '../application/merchant-cases';
import { disputeChallengers, merchantCases } from './schema';

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

  async open(merchantCase: MerchantCase, challenger?: NewDisputeChallenger): Promise<void> {
    const { id, establishmentId, kind, reporterKey, reason, createdAt } = merchantCase;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(merchantCases)
        .values({ id, establishmentId, kind, reporterKey, reason, createdAt });
      if (challenger) {
        await tx.insert(disputeChallengers).values({ caseId: id, establishmentId, ...challenger });
      }
    });
  }

  // Los pendientes, el más antiguo primero.
  async pending(): Promise<MerchantCase[]> {
    // La cuenta de quien disputa no se lee: no hace falta para decidir (EC-08).
    const rows = await this.db
      .select({
        ...caseColumns,
        challenger: {
          responsibleName: disputeChallengers.responsibleName,
          nit: disputeChallengers.nit,
          phone: disputeChallengers.phone,
        },
      })
      .from(merchantCases)
      .leftJoin(disputeChallengers, eq(disputeChallengers.caseId, merchantCases.id))
      .where(eq(merchantCases.status, 'pendiente'))
      .orderBy(asc(merchantCases.createdAt));
    return rows.map(({ challenger, ...row }) => ({
      ...toCase(row),
      ...(challenger ? { challenger } : {}),
    }));
  }

  async findPending(caseId: string): Promise<MerchantCase | null> {
    const [row] = await this.db
      .select(caseColumns)
      .from(merchantCases)
      .where(and(eq(merchantCases.id, caseId), eq(merchantCases.status, 'pendiente')));
    return row ? toCase(row) : null;
  }

  async close(record: MerchantCaseDecisionRecord): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(merchantCases)
        .set({
          status: record.status,
          note: record.note,
          moderatorKey: record.moderatorKey,
          decidedAt: record.decidedAt,
        })
        .where(and(eq(merchantCases.id, record.caseId), eq(merchantCases.status, 'pendiente')));
      // H18: decidido el caso, los datos de quien disputó ya no hacen falta.
      await tx.delete(disputeChallengers).where(eq(disputeChallengers.caseId, record.caseId));
    });
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
