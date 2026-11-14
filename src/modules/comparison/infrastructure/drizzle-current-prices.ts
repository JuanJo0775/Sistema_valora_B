import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CurrentPrice, CurrentPrices } from '../application/current-prices';
import { priceCurrent } from './schema';

export class DrizzleCurrentPrices implements CurrentPrices {
  constructor(private readonly db: NodePgDatabase) {}

  async findByPresentations(presentationIds: string[]): Promise<CurrentPrice[]> {
    if (presentationIds.length === 0) return [];
    const rows = await this.db
      .select({
        reportId: priceCurrent.reportId,
        presentationId: priceCurrent.presentationId,
        establishmentId: priceCurrent.establishmentId,
        priceCop: priceCurrent.priceCop,
        observedAt: priceCurrent.observedAt,
        status: priceCurrent.status,
      })
      .from(priceCurrent)
      .where(inArray(priceCurrent.presentationId, presentationIds));
    // La restricción CHECK de la tabla garantiza que es uno de los dos estados.
    return rows.map((row) => ({ ...row, status: row.status as CurrentPrice['status'] }));
  }
}
