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

type Comparator = (a: RankableOffer, b: RankableOffer) => number;

// Comparación carácter por carácter, sin depender del idioma de la máquina.
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

const cheaperPerUnit: Comparator = (a, b) => a.unitPrice.compareTo(b.unitPrice);
const closer: Comparator = (a, b) => a.distanceMeters - b.distanceMeters;
const moreRecent: Comparator = (a, b) => b.observedAt.getTime() - a.observedAt.getTime();
const byIds: Comparator = (a, b) =>
  compareIds(a.establishmentId, b.establishmentId) ||
  compareIds(a.presentationId, b.presentationId);

// Grill de la #21, pregunta 3: el criterio elegido y su desempate; los identificadores cierran siempre.
const CHAINS: Record<SortCriterion, Comparator[]> = {
  unit_price: [cheaperPerUnit, closer, moreRecent, byIds],
  distance: [closer, cheaperPerUnit, moreRecent, byIds],
  recent: [moreRecent, cheaperPerUnit, closer, byIds],
};

export function rankOffers<T extends RankableOffer>(
  offers: readonly T[],
  sort: SortCriterion,
): Ranking<T> {
  const chain = CHAINS[sort];
  const compare: Comparator = (a, b) => {
    for (const comparator of chain) {
      const difference = comparator(a, b);
      if (difference !== 0) return difference;
    }
    return 0;
  };
  return { sort, offers: [...offers].sort(compare) };
}
