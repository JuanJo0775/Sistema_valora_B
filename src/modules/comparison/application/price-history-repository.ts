import type { HistoryPrice } from '../../../domain/price-history';

// Puerto del historial (grill de la #83): los precios que cuentan, sin datos de quién reportó.
export interface PriceHistoryRepository {
  countedSince(
    presentationIds: string[],
    since: Date,
    establishmentId?: string,
    // H36 (ADR-040): tiendas cuyos precios se conservan pero no se muestran.
    excludedEstablishmentIds?: string[],
  ): Promise<HistoryPrice[]>;
}
