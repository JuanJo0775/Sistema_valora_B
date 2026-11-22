import type { PriceSource } from '../../../domain/initial-price';
import { type Freshness, freshnessOf, ttlDaysFor } from '../../../domain/freshness';
import {
  type RankableOffer,
  rankOffers,
  type SortCriterion,
} from '../../../domain/neutral-ranking';
import { savingsPercent } from '../../../domain/savings';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import { type Discrepancy, officialVsReported } from '../../../domain/official-vs-reported';
import { promotedPriceCop, promotionStatus } from '../../../domain/promotion';
import { isRecentReference } from '../../../domain/wholesale-reference';
import type { Municipality } from '../../../domain/municipality';
import type { ProductForComparisonView, WholesaleReferenceView } from '../../catalog';
import type {
  EstablishmentDetail,
  InMunicipalityQuery,
  NearbyEstablishment,
  WithinRadiusQuery,
} from '../../establishments';
import type { PriceRef, PriceReliability, ReportAtStore } from '../../reliability';
import type { CurrentPrices } from './current-prices';
import type { OfficialPriceCopies, OfficialPriceCopy } from './official-price-copies';
import type { PromotionCopies, PromotionCopy } from './promotion-copies';

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
  // D1 (#204): los reportes recientes de la tienda, uno por persona, con su nivel.
  reportsAt(
    presentationId: string,
    establishmentId: string,
    ttlDays: number,
  ): Promise<ReportAtStore[]>;
}

export interface CompareProductPorts {
  products: ProductLookup;
  stores: StoresWithinRadius;
  prices: Pick<CurrentPrices, 'findByPresentations'>;
  // #204: la copia del precio oficial de commerce.
  officials: Pick<OfficialPriceCopies, 'findByPresentations'>;
  // #206: la copia de las promociones de commerce.
  promotionCopies: PromotionCopies;
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
  // Grill de la #32, pregunta 3: el reporte que se muestra, para poder marcarlo. Un precio oficial
  // no viene de un reporte (#204).
  reportId?: string;
  presentationId: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // Grill de la #15, pregunta 7; B#135: de la comunidad o un dato inicial de la semilla. #204: oficial,
  // publicado por el comercio.
  source: PriceSource | 'oficial';
  freshness: Freshness;
  // Grill de la #15, pregunta 6: el precio por unidad más bajo entre los no desactualizados.
  isCheapest: boolean;
  // Grill de la #31: el nivel que calcula reliability, o en_revision si el precio es sospechoso. Un
  // precio oficial no se califica (#204).
  reliability?: 'alta' | 'media' | 'baja' | 'en_revision';
  confirmations?: number;
  observedAt: Date;
  // D1 (#204): la comunidad corrobora otro precio; el oficial se muestra al lado con aviso.
  discrepancy?: Discrepancy;
}

export interface Comparison {
  productId: string;
  // El orden declarado al usuario (EC-06).
  criteria: { sort: SortCriterion; radiusKm?: number; municipality?: Municipality };
  results: ComparisonItem[];
  // ADR-009: siempre aparte; vacío hasta el módulo comercial (grill de la #15, pregunta 6).
  // ADR-009: siempre aparte de los resultados; solo las activas de las tiendas del área (#206).
  promotions: PromotionItem[];
  // Grill de la #34: aparte de los resultados; no entra al orden ni a isCheapest.
  wholesaleReference?: WholesaleReferenceSummary;
  // B#128 (EC-06): cuánto menos cuesta el más barato que la tienda más cara, entre los que pueden
  // ser el más barato (los mismos de isCheapest). Sin dos tiendas no sale.
  savingsPercent?: number;
}

// D6 (#206): una promoción activa, con el oficial de hoy y el precio con la promoción.
export interface PromotionItem extends Omit<PromotionCopy, 'establishmentId'> {
  establishment: ComparisonItem['establishment'];
  officialPriceCop: number;
  promotedPriceCop: number;
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
    const isCheapest =
      !isStale(candidate) &&
      cheapest !== undefined &&
      candidate.unitPrice.compareTo(cheapest) === 0;
    // #204: el oficial no se califica.
    if (candidate.item.source === 'oficial') return { ...candidate.item, isCheapest };
    const assessed = byPlace.get(placeOf(candidate));
    return {
      ...candidate.item,
      isCheapest,
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

    const { candidates, storesById, officials } = await this.candidatesFor(product, input);
    const ranked = rankInGroups(candidates, input);
    const reliability = await this.ports.reliability.of(
      ranked.flatMap(({ presentationId, establishmentId, item, inReview }) =>
        inReview || item.reportId === undefined
          ? []
          : [{ presentationId, establishmentId, reportId: item.reportId }],
      ),
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
      promotions: await this.activePromotions(product, storesById, officials),
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
  ): Promise<{
    candidates: Candidate[];
    storesById: Map<string, ComparisonItem['establishment']>;
    officials: OfficialPriceCopy[];
  }> {
    const presentations = new Map(product.presentations.map((p) => [p.id, p]));
    const prices = await this.ports.prices.findByPresentations([...presentations.keys()]);
    const officials = await this.ports.officials.findByPresentations([...presentations.keys()]);
    const ids = [...new Set([...prices, ...officials].map((price) => price.establishmentId))];
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
    // #204: donde hay oficial, el precio de la comunidad no sale aparte (la tienda sale una vez).
    const withOfficial = new Set(officials.map(placeOf));
    // Un precio sin tienda en el radio (o sin presentación conocida) no entra.
    for (const price of prices.filter((p) => !withOfficial.has(placeOf(p)))) {
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
    // #204: el precio oficial de la tienda, o la mediana de la comunidad si la corrobora (D1).
    for (const official of officials) {
      const establishment = storesById.get(official.establishmentId);
      const presentation = presentations.get(official.presentationId);
      if (!establishment || !presentation) continue;
      const shown = await this.officialOrReported(official, now, ttlDays);
      const item: Candidate['item'] = {
        establishment,
        ...shown,
        presentationId: official.presentationId,
        unitPrice: calculateUnitPrice(shown.priceCop, presentation),
        freshness: freshnessAt(shown.observedAt, now, ttlDays),
      };
      candidates.push({
        item,
        inReview: false,
        establishmentId: establishment.id,
        presentationId: item.presentationId,
        unitPrice: item.unitPrice,
        distanceMeters: establishment.distanceM ?? 0,
        observedAt: item.observedAt,
      });
    }
    return { candidates, storesById, officials };
  }

  // D6 y ADR-009: las promociones activas de las tiendas del área, calculadas con el oficial de hoy.
  private async activePromotions(
    product: ProductForComparisonView,
    storesById: Map<string, ComparisonItem['establishment']>,
    officials: OfficialPriceCopy[],
  ): Promise<PromotionItem[]> {
    const copies = await this.ports.promotionCopies.findByPresentations(
      product.presentations.map((presentation) => presentation.id),
    );
    const now = this.ports.clock.now();
    const ttlDays = ttlDaysFor(product.isFresh);
    const officialAt = new Map(officials.map((official) => [placeOf(official), official]));
    return copies.flatMap(({ establishmentId, ...promotion }) => {
      const establishment = storesById.get(establishmentId);
      const official = officialAt.get(placeOf({ ...promotion, establishmentId }));
      if (!establishment || !official) return [];
      const officialFreshness = freshnessAt(official.confirmedAt, now, ttlDays);
      if (promotionStatus({ ...promotion, now, officialFreshness }) !== 'activa') return [];
      return [
        {
          ...promotion,
          establishment,
          officialPriceCop: official.priceCop,
          promotedPriceCop: promotedPriceCop(promotion.offer, official.priceCop),
        },
      ];
    });
  }

  // D1 y ADR-008: el oficial, salvo que los reportes recientes y confiables corroboren otro precio.
  private async officialOrReported(
    official: OfficialPriceCopy,
    now: Date,
    ttlDays: number,
  ): Promise<
    Pick<ComparisonItem, 'priceCop' | 'source' | 'observedAt' | 'reportId' | 'discrepancy'>
  > {
    const reports = await this.ports.reliability.reportsAt(
      official.presentationId,
      official.establishmentId,
      ttlDays,
    );
    const resolved = officialVsReported({
      official: { priceCop: official.priceCop, changedAt: official.priceChangedAt },
      reports: reports.map((report) => ({ ...report, reliable: report.level !== 'baja' })),
      now,
      ttlDays,
    });
    const chosen =
      resolved.kind === 'discrepancia'
        ? reports.find((report) => report.reportId === resolved.reportId)
        : undefined;
    if (resolved.kind === 'oficial' || !chosen) {
      return { priceCop: official.priceCop, source: 'oficial', observedAt: official.confirmedAt };
    }
    return {
      priceCop: chosen.priceCop,
      source: 'comunidad',
      observedAt: chosen.observedAt,
      reportId: chosen.reportId,
      discrepancy: resolved.discrepancy,
    };
  }
}
