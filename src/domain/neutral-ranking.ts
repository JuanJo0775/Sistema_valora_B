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

// Comparación carácter por carácter, sin depender del idioma de la máquina.
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function rankOffers<T extends RankableOffer>(
  offers: readonly T[],
  sort: SortCriterion,
): Ranking<T> {
  if (sort === 'distance') {
    return {
      sort,
      offers: [...offers].sort(
        (a, b) =>
          a.distanceMeters - b.distanceMeters ||
          a.unitPrice.compareTo(b.unitPrice) ||
          b.observedAt.getTime() - a.observedAt.getTime() ||
          compareIds(a.establishmentId, b.establishmentId) ||
          compareIds(a.presentationId, b.presentationId),
      ),
    };
  }
  return {
    sort,
    offers: [...offers].sort(
      (a, b) =>
        a.unitPrice.compareTo(b.unitPrice) ||
        a.distanceMeters - b.distanceMeters ||
        b.observedAt.getTime() - a.observedAt.getTime() ||
        compareIds(a.establishmentId, b.establishmentId) ||
        compareIds(a.presentationId, b.presentationId),
    ),
  };
}
