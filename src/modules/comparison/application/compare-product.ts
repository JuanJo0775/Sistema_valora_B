import { type Freshness, freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import {
  type RankableOffer,
  rankOffers,
  type SortCriterion,
} from '../../../domain/neutral-ranking';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { ProductForComparisonView } from '../../catalog';
import type { NearbyEstablishment, WithinRadiusQuery } from '../../establishments';
import type { PriceRef, PriceReliability } from '../../reliability';
import type { CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de catalog y establishments (grill de la #15, pregunta 2).
export interface ProductLookup {
  find(productId: string): Promise<ProductForComparisonView | null>;
}

export interface StoresWithinRadius {
  find(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
}

export interface Clock {
  now(): Date;
}

// Puerto hacia la consulta pública de reliability (grill de la #31, pregunta 6).
export interface PricesReliability {
  of(prices: PriceRef[], ttlDays: number): Promise<PriceReliability[]>;
}

export interface CompareProductPorts {
  products: ProductLookup;
  stores: StoresWithinRadius;
  prices: CurrentPrices;
  reliability: PricesReliability;
  clock: Clock;
}

export interface CompareProductInput {
  productId: string;
  lat: number;
  lng: number;
  radiusKm: number;
  sort: SortCriterion;
  onlyCurrent: boolean;
}

export interface ComparisonItem {
  establishment: NearbyEstablishment;
  presentationId: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // Grill de la #15, pregunta 7: hoy todo precio viene de reportes de la comunidad.
  source: 'comunidad';
  freshness: Freshness;
  // Grill de la #15, pregunta 6: el precio por unidad más bajo entre los no desactualizados.
  isCheapest: boolean;
  // Grill de la #31: el nivel que calcula reliability, o en_revision si el precio es sospechoso.
  reliability: 'alta' | 'media' | 'baja' | 'en_revision';
  confirmations: number;
  observedAt: Date;
}

export interface Comparison {
  productId: string;
  // El orden declarado al usuario (EC-06).
  criteria: { sort: SortCriterion; radiusKm: number };
  results: ComparisonItem[];
  // ADR-009: siempre aparte; vacío hasta el módulo comercial (grill de la #15, pregunta 6).
  promotions: [];
}

// Lo que rankOffers puede leer, junto al resultado que se devuelve.
interface Candidate extends RankableOffer {
  item: Omit<ComparisonItem, 'isCheapest' | 'reliability' | 'confirmations'>;
  reportId: string;
  inReview: boolean;
}

// El precio por unidad más bajo (valor exacto) de la lista, si hay alguno.
function lowestUnitPrice(candidates: Candidate[]): UnitPrice | undefined {
  return candidates.reduce<UnitPrice | undefined>(
    (lowest, candidate) =>
      lowest === undefined || candidate.unitPrice.compareTo(lowest) < 0
        ? candidate.unitPrice
        : lowest,
    undefined,
  );
}

// La #14 acepta precios vistos hasta 5 minutos «en el futuro» por la diferencia de relojes: para la
// vigencia, esa edad negativa cuenta como cero.
function freshnessAt(observedAt: Date, now: Date, ttlDays: number): Freshness {
  const reference = observedAt > now ? observedAt : now;
  return freshnessOf({ observedAt, now: reference, ttlDays });
}

// Grill de la #15, pregunta 5, y de la #31, pregunta 5: los desactualizados y los que están en
// revisión no entran al orden; van al final. Con onlyCurrent solo quedan los vigentes.
const isStale = (candidate: Candidate) =>
  candidate.inReview || candidate.item.freshness === 'desactualizado';

function rankInGroups(candidates: Candidate[], input: CompareProductInput): Candidate[] {
  const rank = (group: Candidate[]) => rankOffers(group, input.sort).offers;
  if (input.onlyCurrent) {
    return rank(
      candidates.filter(
        (candidate) => !candidate.inReview && candidate.item.freshness === 'vigente',
      ),
    );
  }
  return [
    ...rank(candidates.filter((candidate) => !isStale(candidate))),
    ...rank(candidates.filter(isStale)),
  ];
}

const placeOf = (place: { presentationId: string; establishmentId: string }) =>
  `${place.presentationId}:${place.establishmentId}`;

// isCheapest entre los resultados que se muestran; un desactualizado o en revisión nunca es el más
// barato. La confiabilidad sale de reliability; un precio en revisión dice en_revision.
function toResults(ranked: Candidate[], reliability: PriceReliability[]): ComparisonItem[] {
  const cheapest = lowestUnitPrice(ranked.filter((candidate) => !isStale(candidate)));
  const byPlace = new Map(reliability.map((assessed) => [placeOf(assessed), assessed]));
  return ranked.map((candidate) => {
    const assessed = byPlace.get(placeOf(candidate));
    return {
      ...candidate.item,
      isCheapest:
        !isStale(candidate) &&
        cheapest !== undefined &&
        candidate.unitPrice.compareTo(cheapest) === 0,
      // Sin evaluación (precios anteriores a la #31) cuenta como baja.
      reliability: candidate.inReview ? 'en_revision' : (assessed?.level ?? 'baja'),
      confirmations: candidate.inReview ? 0 : (assessed?.confirmations ?? 0),
    };
  });
}

export class CompareProduct {
  constructor(private readonly ports: CompareProductPorts) {}

  async execute(input: CompareProductInput): Promise<Comparison | null> {
    const product = await this.ports.products.find(input.productId);
    if (!product) return null;

    const ranked = rankInGroups(await this.candidatesFor(product, input), input);
    const reliability = await this.ports.reliability.of(
      ranked
        .filter((candidate) => !candidate.inReview)
        .map(({ presentationId, establishmentId, reportId }) => ({
          presentationId,
          establishmentId,
          reportId,
        })),
      ttlDaysFor(product.isFresh),
    );
    return {
      productId: product.id,
      criteria: { sort: input.sort, radiusKm: input.radiusKm },
      results: toResults(ranked, reliability),
      promotions: [],
    };
  }

  // Los precios vigentes del producto en las tiendas del radio, con su precio por unidad y vigencia.
  private async candidatesFor(
    product: ProductForComparisonView,
    input: CompareProductInput,
  ): Promise<Candidate[]> {
    const presentations = new Map(product.presentations.map((p) => [p.id, p]));
    const prices = await this.ports.prices.findByPresentations([...presentations.keys()]);
    const stores = await this.ports.stores.find({
      ids: [...new Set(prices.map((price) => price.establishmentId))],
      lat: input.lat,
      lng: input.lng,
      radiusMeters: input.radiusKm * 1000,
    });
    const storesById = new Map(stores.map((store) => [store.id, store]));
    const now = this.ports.clock.now();
    const ttlDays = ttlDaysFor(product.isFresh);

    const candidates: Candidate[] = [];
    // Un precio sin tienda en el radio (o sin presentación conocida) no entra.
    for (const price of prices) {
      const establishment = storesById.get(price.establishmentId);
      const presentation = presentations.get(price.presentationId);
      if (!establishment || !presentation) continue;
      const item: Candidate['item'] = {
        establishment,
        presentationId: price.presentationId,
        priceCop: price.priceCop,
        unitPrice: calculateUnitPrice(price.priceCop, presentation),
        source: 'comunidad',
        freshness: freshnessAt(price.observedAt, now, ttlDays),
        observedAt: price.observedAt,
      };
      candidates.push({
        item,
        reportId: price.reportId,
        inReview: price.status === 'en_revision',
        establishmentId: establishment.id,
        presentationId: item.presentationId,
        unitPrice: item.unitPrice,
        distanceMeters: establishment.distanceM,
        observedAt: item.observedAt,
      });
    }
    return candidates;
  }
}
