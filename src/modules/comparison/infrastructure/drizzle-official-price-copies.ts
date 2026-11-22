import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { OfficialPriceCopies, OfficialPriceCopy } from '../application/official-price-copies';
import { officialPrices } from './schema';

export class DrizzleOfficialPriceCopies implements OfficialPriceCopies {
  constructor(private readonly db: NodePgDatabase) {}

  async findByPresentations(presentationIds: string[]): Promise<OfficialPriceCopy[]> {
    if (presentationIds.length === 0) return [];
    return this.db
      .select()
      .from(officialPrices)
      .where(inArray(officialPrices.presentationId, presentationIds));
  }
}
