import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { merchantClaims, merchantNotices } from './schema';

// B9 (#209): los comercios que reciben el resumen y lo que ya se les avisó.
export class DrizzleMerchantNotices {
  constructor(private readonly db: NodePgDatabase) {}

  async verifiedAccounts(): Promise<string[]> {
    const rows = await this.db
      .select({ accountId: merchantClaims.accountId })
      .from(merchantClaims)
      .where(eq(merchantClaims.status, 'verificado'));
    return rows.map((row) => row.accountId);
  }

  async knownKeys(accountId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ key: merchantNotices.key })
      .from(merchantNotices)
      .where(eq(merchantNotices.accountId, accountId));
    return new Set(rows.map((row) => row.key));
  }

  async sentOn(accountId: string, day: string): Promise<boolean> {
    const [found] = await this.db
      .select({ key: merchantNotices.key })
      .from(merchantNotices)
      .where(and(eq(merchantNotices.accountId, accountId), eq(merchantNotices.notifiedOn, day)))
      .limit(1);
    return found !== undefined;
  }

  async record(accountId: string, day: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.db
      .insert(merchantNotices)
      .values(keys.map((key) => ({ accountId, key, notifiedOn: day })))
      .onConflictDoNothing();
  }
}
