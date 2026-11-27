import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { verifiedMerchants } from './schema';

// H6: si una tienda tiene un comercio verificado, según la copia de comparison.
export class DrizzleVerifiedMerchants {
  constructor(private readonly db: NodePgDatabase) {}

  async isVerified(establishmentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: verifiedMerchants.establishmentId })
      .from(verifiedMerchants)
      .where(eq(verifiedMerchants.establishmentId, establishmentId))
      .limit(1);
    return rows.length > 0;
  }
}
