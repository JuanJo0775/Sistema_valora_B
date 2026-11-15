import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  WholesaleReference,
  WholesaleReferenceRepository,
  WholesaleReferenceView,
} from '../application/wholesale-references';
import { wholesaleReferences } from './schema';

export class DrizzleWholesaleReferenceRepository implements WholesaleReferenceRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(reference: WholesaleReference): Promise<void> {
    await this.db
      .insert(wholesaleReferences)
      .values(reference)
      .onConflictDoUpdate({
        target: wholesaleReferences.id,
        set: {
          productId: reference.productId,
          sipsaName: reference.sipsaName,
          market: reference.market,
          periodStart: reference.periodStart,
          periodEnd: reference.periodEnd,
          pricePerKgCop: reference.pricePerKgCop,
          sourceUrl: reference.sourceUrl,
          responsible: reference.responsible,
          consultedAt: reference.consultedAt,
        },
      });
  }

  async latestFor(productId: string): Promise<WholesaleReferenceView | null> {
    const [latest] = await this.db
      .select({
        productId: wholesaleReferences.productId,
        sipsaName: wholesaleReferences.sipsaName,
        market: wholesaleReferences.market,
        periodStart: wholesaleReferences.periodStart,
        periodEnd: wholesaleReferences.periodEnd,
        pricePerKgCop: wholesaleReferences.pricePerKgCop,
        sourceUrl: wholesaleReferences.sourceUrl,
      })
      .from(wholesaleReferences)
      .where(eq(wholesaleReferences.productId, productId))
      .orderBy(desc(wholesaleReferences.periodEnd))
      .limit(1);
    return latest ?? null;
  }
}
