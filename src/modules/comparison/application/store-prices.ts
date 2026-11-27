import type { PriceSource } from '../../../domain/initial-price';
import { type Freshness, ttlDaysFor } from '../../../domain/freshness';
import type { Discrepancy } from '../../../domain/official-vs-reported';
import { promotedPriceCop, promotionStatus, type PromotionOffer } from '../../../domain/promotion';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { PresentationForPricing } from '../../catalog';
import type { EstablishmentDetail, StoreContact } from '../../establishments';
import type { PriceRef, PriceReliability } from '../../reliability';
import { freshnessAt } from './compare-product';
import type { CurrentPrices } from './current-prices';
import { type EffectivePrice, effectivePrices } from './effective-prices';
import type { OfficialPriceCopies, OfficialPriceCopy } from './official-price-copies';
import type { StoreReports } from './official-resolution';
import type { PromotionConditionsCopy, PromotionCopies, PromotionCopy } from './promotion-copies';

// Puertos hacia las consultas públicas de establishments, catalog y reliability (por su index.ts).
export interface StorePricesPorts {
  stores: { find(establishmentId: string): Promise<EstablishmentDetail | null> };
  // D5 (#207): el horario y el teléfono que puso el comercio, por la interfaz de establishments.
  contacts: { of(establishmentId: string): Promise<StoreContact | null> };
  presentations: { of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> };
  prices: Pick<CurrentPrices, 'findByEstablishment'>;
  // #218: la copia del precio oficial de la tienda.
  officials: Pick<OfficialPriceCopies, 'findByEstablishment'>;
  // H6: si la tienda tiene un comercio verificado (copia que comparison guarda con los eventos).
  merchants: { isVerified(establishmentId: string): Promise<boolean> };
  // H6 y ADR-009: las promociones de la tienda; la ficha las muestra aparte de los precios.
  promotionCopies: Pick<PromotionCopies, 'findByEstablishment'>;
  reliability: StoreReports & {
    of(prices: PriceRef[], ttlDays: number): Promise<PriceReliability[]>;
  };
  clock: { now(): Date };
}

// Grill de la #28, pregunta 1: la misma forma de cada resultado de la comparación, sin la distancia.
export interface StorePriceItem {
  productId: string;
  presentationId: string;
  productName: string;
  // #218: un precio oficial no viene de un reporte ni se califica.
  reportId?: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // B#135: de la comunidad o un dato inicial de la semilla. #218: u oficial.
  source: PriceSource | 'oficial';
  freshness: Freshness;
  reliability?: 'alta' | 'media' | 'baja' | 'en_revision';
  confirmations?: number;
  observedAt: Date;
  // D1 (#218): la comunidad corrobora otro precio; el oficial va al lado.
  discrepancy?: Discrepancy;
}

// H6: una promoción activa de la tienda, con el «antes» (el oficial vigente) y el precio con ella.
export interface StorePromotion {
  id: string;
  presentationId: string;
  productName: string;
  offer: PromotionOffer;
  conditions: PromotionConditionsCopy;
  validFrom: string;
  validUntil: string;
  officialPriceCop: number;
  promotedPriceCop: number;
}

export interface StorePricesResult {
  establishment: EstablishmentDetail & StoreContact;
  // H6: la tienda tiene un comercio verificado.
  verifiedMerchant: boolean;
  prices: StorePriceItem[];
  promotions: StorePromotion[];
}

interface Row {
  price: EffectivePrice;
  presentation: PresentationForPricing;
  ttlDays: number;
}

// RF-008: los precios vigentes de una tienda. #218: con la misma regla del precio oficial (D1).
export class StorePrices {
  constructor(private readonly ports: StorePricesPorts) {}

  async of(
    establishmentId: string,
    options: { onlyCurrent: boolean },
  ): Promise<StorePricesResult | null> {
    const { stores, contacts, presentations, prices, officials, reliability, clock } = this.ports;
    const { merchants, promotionCopies } = this.ports;
    const store = await stores.find(establishmentId);
    if (!store) return null;
    const establishment = { ...store, ...(await contacts.of(establishmentId)) };
    const community = await prices.findByEstablishment(establishmentId);
    const official = await officials.findByEstablishment(establishmentId);
    const copies = await promotionCopies.findByEstablishment(establishmentId);
    const known = await presentations.of(
      [...community, ...official, ...copies].map((price) => price.presentationId),
    );
    const now = clock.now();
    const current = await effectivePrices({
      current: community,
      officials: official,
      reliability,
      ttlDaysOf: (presentationId) => ttlDaysFor(known.get(presentationId)?.isFresh ?? false),
      now,
    });

    // Un precio de una presentación que ya no está en el catálogo no se muestra.
    const rows = current.flatMap((price): Row[] => {
      const presentation = known.get(price.presentationId);
      return presentation
        ? [{ price, presentation, ttlDays: ttlDaysFor(presentation.isFresh) }]
        : [];
    });
    const assessed = await this.reliabilityOf(rows, reliability);

    const items = rows.map(({ price, presentation, ttlDays }): StorePriceItem => {
      const shown = {
        productId: presentation.productId,
        presentationId: price.presentationId,
        productName: presentation.label,
        ...(price.reportId === undefined ? {} : { reportId: price.reportId }),
        priceCop: price.priceCop,
        unitPrice: calculateUnitPrice(price.priceCop, presentation),
        source: price.source,
        freshness: freshnessAt(price.observedAt, now, ttlDays),
        observedAt: price.observedAt,
        ...(price.discrepancy === undefined ? {} : { discrepancy: price.discrepancy }),
      };
      // #218: el oficial no se califica.
      if (price.reportId === undefined) return shown;
      const inReview = price.status === 'en_revision';
      const level = assessed.get(price.reportId);
      return {
        ...shown,
        // Sin evaluación (precios anteriores a la #31) cuenta como baja, como en la comparación.
        reliability: inReview ? 'en_revision' : (level?.level ?? 'baja'),
        confirmations: inReview ? 0 : (level?.confirmations ?? 0),
      };
    });
    // Grill de la #28, pregunta 2: como en la comparación, onlyCurrent quita los desactualizados y
    // los que están en revisión.
    const shown = options.onlyCurrent
      ? items.filter(
          (item) => item.freshness !== 'desactualizado' && item.reliability !== 'en_revision',
        )
      : items;
    shown.sort((a, b) => a.productName.localeCompare(b.productName, 'es'));
    return {
      establishment,
      verifiedMerchant: await merchants.isVerified(establishmentId),
      prices: shown,
      promotions: activePromotions(copies, official, known, now),
    };
  }

  // La confiabilidad se calcula con el TTL de la categoría de cada presentación (fresca o no).
  private async reliabilityOf(
    rows: Row[],
    reliability: StorePricesPorts['reliability'],
  ): Promise<Map<string, PriceReliability>> {
    const byTtl = new Map<number, PriceRef[]>();
    for (const { price, ttlDays } of rows) {
      if (price.status === 'en_revision' || price.reportId === undefined) continue;
      const refs = byTtl.get(ttlDays) ?? [];
      refs.push({
        presentationId: price.presentationId,
        establishmentId: price.establishmentId,
        reportId: price.reportId,
      });
      byTtl.set(ttlDays, refs);
    }
    const results = await Promise.all(
      [...byTtl].map(([ttlDays, refs]) => reliability.of(refs, ttlDays)),
    );
    return new Map(results.flat().map((assessed) => [assessed.reportId, assessed]));
  }
}

// H6: solo las activas (fechas vigentes y precio oficial vigente), calculadas con el oficial de hoy.
function activePromotions(
  copies: PromotionCopy[],
  officials: OfficialPriceCopy[],
  known: Map<string, PresentationForPricing>,
  now: Date,
): StorePromotion[] {
  const officialOf = new Map(officials.map((official) => [official.presentationId, official]));
  return copies.flatMap((copy): StorePromotion[] => {
    const official = officialOf.get(copy.presentationId);
    const presentation = known.get(copy.presentationId);
    if (!official || !presentation) return [];
    const officialFreshness = freshnessAt(
      official.confirmedAt,
      now,
      ttlDaysFor(presentation.isFresh),
    );
    if (promotionStatus({ ...copy, now, officialFreshness }) !== 'activa') return [];
    return [
      {
        id: copy.id,
        presentationId: copy.presentationId,
        productName: presentation.label,
        offer: copy.offer,
        conditions: copy.conditions,
        validFrom: copy.validFrom,
        validUntil: copy.validUntil,
        officialPriceCop: official.priceCop,
        promotedPriceCop: promotedPriceCop(copy.offer, official.priceCop),
      },
    ];
  });
}
