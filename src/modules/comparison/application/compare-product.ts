import type { PriceSource } from '../../../domain/initial-price';
import { type Freshness, freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import {
  type RankableOffer,
  rankOffers,
  type SortCriterion,
} from '../../../domain/neutral-ranking';
import { savingsPercent } from '../../../domain/savings';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import { isRecentReference } from '../../../domain/wholesale-reference';
import type { Municipality } from '../../../domain/municipality';
import type { ProductForComparisonView, WholesaleReferenceView } from '../../catalog';
import type {
  EstablishmentDetail,
  InMunicipalityQuery,
  NearbyEstablishment,
  WithinRadiusQuery,
} from '../../establishments';
import type { PriceRef, PriceReliability } from '../../reliability';
import type { CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de catalog y establishments (grill de la #15, pregunta 2).
export interface ProductLookup {
  find(productId: string): Promise<ProductForComparisonView | null>;
}

export interface StoresWithinRadius {
  find(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
  // Grill de la #106: sin la ubicación del usuario, las de un municipio.
  findInMunicipality(query: InMunicipalityQuery): Promise<EstablishmentDetail[]>;
}

// Grill de la #106: sin la ubicación del usuario no hay distancia con qué ordenar (400).
export class DistanceNeedsLocationError extends Error {
  constructor() {
    super('Para ordenar por distancia hay que enviar lat y lng.');
    this.name = 'DistanceNeedsLocationError';
  }
}

// Hace falta la ubicación (lat y lng) o un municipio para saber qué tiendas comparar (400).
export class MissingAreaError extends Error {
  constructor() {
    super('Envía lat y lng, o un municipio.');
    this.name = 'MissingAreaError';
  }
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
  prices: Pick<CurrentPrices, 'findByPresentations'>;
  reliability: PricesReliability;
  // Grill de la #34: la referencia SIPSA más reciente del producto, por la consulta pública de catalog.
  references: { latestFor(productId: string): Promise<WholesaleReferenceView | null> };
  clock: Clock;
}

// RF-014 RN3: precio mayorista por kilo de una fuente pública; nunca es precio de una tienda.
export interface WholesaleReferenceSummary {
  source: 'SIPSA (DANE)';
  productName: string;
  market: string;
  pricePerKgCop: number;
  periodStart: string;
  periodEnd: string;
  url: string;
}

export interface CompareProductInput {
  productId: string;
  // Grill de la #106: la ubicación es opcional si viene el municipio.
  lat?: number;
  lng?: number;
  municipality?: Municipality;
  radiusKm: number;
  sort: SortCriterion;
  onlyCurrent: boolean;
}

export interface ComparisonItem {
  // Sin la ubicación del usuario (#106) no hay distancia.
  establishment: EstablishmentDetail & { distanceM?: number };
  // Grill de la #32, pregunta 3: el reporte que se muestra, para poder marcarlo.
  reportId: string;
  presentationId: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // Grill de la #15, pregunta 7; B#135: de la comunidad o un dato inicial de la semilla.
  source: PriceSource;
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
  criteria: { sort: SortCriterion; radiusKm?: number; municipality?: Municipality };
  results: ComparisonItem[];
  // ADR-009: siempre aparte; vacío hasta el módulo comercial (grill de la #15, pregunta 6).
  promotions: [];
  // Grill de la #34: aparte de los resultados; no entra al orden ni a isCheapest.
  wholesaleReference?: WholesaleReferenceSummary;
  // B#128 (EC-06): cuánto menos cuesta el más barato que la tienda más cara, entre los que pueden
  // ser el más barato (los mismos de isCheapest). Sin dos tiendas no sale.
  savingsPercent?: number;
}

// Lo que rankOffers puede leer, junto al resultado que se devuelve.
interface Candidate extends RankableOffer {
  item: Omit<ComparisonItem, 'isCheapest' | 'reliability' | 'confirmations'>;
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
export function freshnessAt(observedAt: Date, now: Date, ttlDays: number): Freshness {
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
    const located = input.lat !== undefined && input.lng !== undefined;
    if (!located && input.municipality === undefined) throw new MissingAreaError();
    if (!located && input.sort === 'distance') throw new DistanceNeedsLocationError();
    const product = await this.ports.products.find(input.productId);
    if (!product) return null;

    const ranked = rankInGroups(await this.candidatesFor(product, input), input);
    const reliability = await this.ports.reliability.of(
      ranked
        .filter((candidate) => !candidate.inReview)
        .map(({ presentationId, establishmentId, item }) => ({
          presentationId,
          establishmentId,
          reportId: item.reportId,
        })),
      ttlDaysFor(product.isFresh),
    );
    const reference = await this.ports.references.latestFor(product.id);
    const savings = savingsPercent(ranked.filter((candidate) => !isStale(candidate)));
    return {
      productId: product.id,
      criteria: {
        sort: input.sort,
        ...(input.lat === undefined ? {} : { radiusKm: input.radiusKm }),
        ...(input.municipality === undefined ? {} : { municipality: input.municipality }),
      },
      results: toResults(ranked, reliability),
      promotions: [],
      ...(savings === undefined ? {} : { savingsPercent: savings }),
      // Pregunta 3: solo si su periodo terminó hace 30 días o menos.
      ...(reference && isRecentReference(reference.periodEnd, this.ports.clock.now())
        ? {
            wholesaleReference: {
              source: 'SIPSA (DANE)' as const,
              productName: reference.sipsaName,
              market: reference.market,
              pricePerKgCop: reference.pricePerKgCop,
              periodStart: reference.periodStart,
              periodEnd: reference.periodEnd,
              url: reference.sourceUrl,
            },
          }
        : {}),
    };
  }

  // execute() ya comprobó que, sin ubicación, viene el municipio.
  private storesInMunicipality(
    ids: string[],
    municipality: Municipality | undefined,
  ): Promise<EstablishmentDetail[]> {
    if (municipality === undefined) throw new MissingAreaError();
    return this.ports.stores.findInMunicipality({ ids, municipality });
  }

  // Los precios vigentes del producto en las tiendas del radio, con su precio por unidad y vigencia.
  private async candidatesFor(
    product: ProductForComparisonView,
    input: CompareProductInput,
  ): Promise<Candidate[]> {
    const presentations = new Map(product.presentations.map((p) => [p.id, p]));
    const prices = await this.ports.prices.findByPresentations([...presentations.keys()]);
    const ids = [...new Set(prices.map((price) => price.establishmentId))];
    const { lat, lng, municipality } = input;
    const stores: ComparisonItem['establishment'][] =
      lat !== undefined && lng !== undefined
        ? await this.ports.stores.find({
            ids,
            lat,
            lng,
            radiusMeters: input.radiusKm * 1000,
            ...(municipality === undefined ? {} : { municipality }),
          })
        : await this.storesInMunicipality(ids, municipality);
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
        reportId: price.reportId,
        presentationId: price.presentationId,
        priceCop: price.priceCop,
        unitPrice: calculateUnitPrice(price.priceCop, presentation),
        source: price.source,
        freshness: freshnessAt(price.observedAt, now, ttlDays),
        observedAt: price.observedAt,
      };
      candidates.push({
        item,
        inReview: price.status === 'en_revision',
        establishmentId: establishment.id,
        presentationId: item.presentationId,
        unitPrice: item.unitPrice,
        // Sin ubicación todas empatan en distancia; decide el resto de la cadena (#21).
        distanceMeters: establishment.distanceM ?? 0,
        observedAt: item.observedAt,
      });
    }
    return candidates;
  }
}
