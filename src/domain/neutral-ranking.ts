import type { UnitPrice } from './unit-price';

// Criterios de orden que declara la comparación (parámetro sort del contrato).
export type SortCriterion = 'unit_price' | 'distance' | 'recent';

// Lo único que la regla puede leer de cada resultado: nada comercial entra al orden (EC-06).
export interface RankableOffer {
  establishmentId: string;
  presentationId: string;
  unitPrice: UnitPrice;
  distanceMeters: number;
  observedAt: Date;
}

export interface Ranking<T extends RankableOffer> {
  sort: SortCriterion;
  offers: T[];
}

export function rankOffers<T extends RankableOffer>(
  offers: readonly T[],
  sort: SortCriterion,
): Ranking<T> {
  return {
    sort,
    offers: [...offers].sort((a, b) => a.unitPrice.compareTo(b.unitPrice)),
  };
}
