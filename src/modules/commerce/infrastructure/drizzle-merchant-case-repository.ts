import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { MerchantCase, MerchantCaseRepository } from '../application/merchant-cases';
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
}
