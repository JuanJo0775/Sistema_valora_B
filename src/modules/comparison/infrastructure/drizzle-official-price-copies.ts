import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { OfficialPriceCopies, OfficialPriceCopy } from '../application/official-price-copies';
import { officialPrices } from './schema';

export class DrizzleOfficialPriceCopies implements OfficialPriceCopies {
  constructor(private readonly db: NodePgDatabase) {}

  async findAll(): Promise<OfficialPriceCopy[]> {
    return this.db.select().from(officialPrices);
  }

  async findByPresentations(presentationIds: string[]): Promise<OfficialPriceCopy[]> {
    if (presentationIds.length === 0) return [];
    return this.db
      .select()
      .from(officialPrices)
      .where(inArray(officialPrices.presentationId, presentationIds));
  }

  async findByEstablishments(establishmentIds: string[]): Promise<OfficialPriceCopy[]> {
    if (establishmentIds.length === 0) return [];
    return this.db
      .select()
      .from(officialPrices)
      .where(inArray(officialPrices.establishmentId, establishmentIds));
  }

  async findByEstablishment(establishmentId: string): Promise<OfficialPriceCopy[]> {
    return this.db
      .select()
      .from(officialPrices)
      .where(eq(officialPrices.establishmentId, establishmentId));
  }
}
