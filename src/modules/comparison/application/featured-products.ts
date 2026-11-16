import { rankFeaturedProducts } from '../../../domain/featured-products';
import { ttlDaysFor } from '../../../domain/freshness';
import type { Municipality } from '../../../domain/municipality';
import { type RankableOffer, rankOffers } from '../../../domain/neutral-ranking';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { PresentationForPricing, ProductSummaryView } from '../../catalog';
import type { EstablishmentDetail, InMunicipalityQuery } from '../../establishments';
import { freshnessAt } from './compare-product';
import type { CurrentPrice, CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de establishments y catalog (por su index.ts).
export interface FeaturedProductsPorts {
  prices: Pick<CurrentPrices, 'findAll'>;
  stores: { findInMunicipality(query: InMunicipalityQuery): Promise<EstablishmentDetail[]> };
  presentations: { of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> };
  products: { of(productIds: string[]): Promise<Map<string, ProductSummaryView>> };
  clock: { now(): Date };
}

export interface FeaturedProductsInput {
  municipality: Municipality;
  limit: number;
}

// El precio más bajo por unidad del producto en el municipio, con la tienda donde está.
export interface CheapestPrice {
  presentationId: string;
  label: string;
  priceCop: number;
  unitPrice: UnitPrice;
  establishment: { id: string; name: string };
}

export interface FeaturedProduct extends Omit<ProductSummaryView, 'id'> {
  productId: string;
  storeCount: number;
  cheapest: CheapestPrice;
}

export interface FeaturedProductsResult {
  // El orden declarado al usuario (EC-06).
  criteria: { municipality: Municipality; sort: 'store_count' };
  items: FeaturedProduct[];
}

interface Offer extends RankableOffer {
  price: CurrentPrice;
  presentation: PresentationForPricing;
  establishment: EstablishmentDetail;
}

function groupByProduct(offers: Offer[]): Map<string, Offer[]> {
  const groups = new Map<string, Offer[]>();
  for (const offer of offers) {
    const group = groups.get(offer.presentation.productId) ?? [];
    group.push(offer);
    groups.set(offer.presentation.productId, group);
  }
  return groups;
}

// B#120 (RF-008, RF-009): la canasta básica de hoy, leída de price_current.
export class FeaturedProducts {
  constructor(private readonly ports: FeaturedProductsPorts) {}

  async of(input: FeaturedProductsInput): Promise<FeaturedProductsResult> {
    const candidates = [...groupByProduct(await this.offersIn(input.municipality))].map(
      ([productId, offers]) => {
        // El más barato con la misma cadena de desempates de la comparación (#21).
        const [cheapest] = rankOffers(offers, 'unit_price').offers as [Offer];
        return {
          productId,
          storeCount: new Set(offers.map((offer) => offer.establishmentId)).size,
          unitPrice: cheapest.unitPrice,
          cheapest,
        };
      },
    );
    const ranked = rankFeaturedProducts(candidates, input.limit);
    const summaries = await this.ports.products.of(ranked.map(({ productId }) => productId));
    return {
      criteria: { municipality: input.municipality, sort: 'store_count' },
      items: ranked.flatMap(({ productId, storeCount, cheapest }) => {
        const summary = summaries.get(productId);
        if (!summary) return [];
        return [
          {
            productId,
            name: summary.name,
            ...(summary.brand === undefined ? {} : { brand: summary.brand }),
            category: summary.category,
            storeCount,
            cheapest: {
              presentationId: cheapest.presentationId,
              label: cheapest.presentation.label,
              priceCop: cheapest.price.priceCop,
              unitPrice: cheapest.unitPrice,
              establishment: { id: cheapest.establishment.id, name: cheapest.establishment.name },
            },
          },
        ];
      }),
    };
  }

  // Los precios de las tiendas del municipio, con su presentación y su precio por unidad.
  private async offersIn(municipality: Municipality): Promise<Offer[]> {
    const { prices, stores, presentations } = this.ports;
    const current = await prices.findAll();
    const [inMunicipality, known] = await Promise.all([
      stores.findInMunicipality({
        ids: [...new Set(current.map((price) => price.establishmentId))],
        municipality,
      }),
      presentations.of([...new Set(current.map((price) => price.presentationId))]),
    ]);
    const storesById = new Map(inMunicipality.map((store) => [store.id, store]));
    const now = this.ports.clock.now();
    return current.flatMap((price) => {
      const establishment = storesById.get(price.establishmentId);
      const presentation = known.get(price.presentationId);
      if (!establishment || !presentation) return [];
      // Como la comparación con onlyCurrent: ni en revisión, ni por confirmar, ni desactualizados.
      const freshness = freshnessAt(price.observedAt, now, ttlDaysFor(presentation.isFresh));
      if (price.status === 'en_revision' || freshness !== 'vigente') return [];
      return [
        {
          price,
          presentation,
          establishment,
          establishmentId: price.establishmentId,
          presentationId: price.presentationId,
          unitPrice: calculateUnitPrice(price.priceCop, presentation),
          // Sin ubicación del usuario todas empatan en distancia.
          distanceMeters: 0,
          observedAt: price.observedAt,
        },
      ];
    });
  }
}
