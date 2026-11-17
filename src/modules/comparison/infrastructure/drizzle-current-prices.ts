import { eq, inArray, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { CurrentPrice, CurrentPrices } from '../application/current-prices';
import { priceCurrent } from './schema';

export class DrizzleCurrentPrices implements CurrentPrices {
  constructor(private readonly db: NodePgDatabase) {}

  async findByPresentations(presentationIds: string[]): Promise<CurrentPrice[]> {
    if (presentationIds.length === 0) return [];
    return this.find(inArray(priceCurrent.presentationId, presentationIds));
  }

  findByEstablishment(establishmentId: string): Promise<CurrentPrice[]> {
    return this.find(eq(priceCurrent.establishmentId, establishmentId));
  }

  // B#131: el conteo de precios de las tiendas de una lista.
  async findByEstablishments(establishmentIds: string[]): Promise<CurrentPrice[]> {
    if (establishmentIds.length === 0) return [];
    return this.find(inArray(priceCurrent.establishmentId, establishmentIds));
  }

  // B#120: la canasta básica filtra por municipio con la consulta pública de establishments.
  findAll(): Promise<CurrentPrice[]> {
    return this.find();
  }

  private async find(where?: SQL): Promise<CurrentPrice[]> {
    const rows = await this.db
      .select({
        reportId: priceCurrent.reportId,
        presentationId: priceCurrent.presentationId,
        establishmentId: priceCurrent.establishmentId,
        priceCop: priceCurrent.priceCop,
        observedAt: priceCurrent.observedAt,
        status: priceCurrent.status,
        source: priceCurrent.source,
      })
      .from(priceCurrent)
      .where(where);
    // Las restricciones CHECK de la tabla garantizan el estado y la fuente.
    return rows.map((row) => ({
      ...row,
      status: row.status as CurrentPrice['status'],
      source: row.source as CurrentPrice['source'],
    }));
  }
}
