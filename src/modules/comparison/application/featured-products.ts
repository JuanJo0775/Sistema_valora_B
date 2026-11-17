import { rankFeaturedProducts } from '../../../domain/featured-products';
import { ttlDaysFor } from '../../../domain/freshness';
import type { Municipality } from '../../../domain/municipality';
import { type RankableOffer, rankOffers } from '../../../domain/neutral-ranking';
import { savingsPercent } from '../../../domain/savings';
import { calculateUnitPrice, type UnitPrice } from '../../../domain/unit-price';
import type { PresentationForPricing, ProductSummaryView } from '../../catalog';
import type {
  EstablishmentDetail,
  InMunicipalityQuery,
  NearbyEstablishment,
  WithinRadiusQuery,
} from '../../establishments';
import { freshnessAt, MissingAreaError } from './compare-product';
import type { CurrentPrice, CurrentPrices } from './current-prices';

// Puertos hacia las consultas públicas de establishments y catalog (por su index.ts).
export interface FeaturedProductsPorts {
  prices: Pick<CurrentPrices, 'findAll'>;
  stores: {
    // B#128: con la ubicación del usuario, las tiendas del radio con su distancia.
    find(query: WithinRadiusQuery): Promise<NearbyEstablishment[]>;
    findInMunicipality(query: InMunicipalityQuery): Promise<EstablishmentDetail[]>;
  };
  presentations: { of(presentationIds: string[]): Promise<Map<string, PresentationForPricing>> };
  products: { of(productIds: string[]): Promise<Map<string, ProductSummaryView>> };
  clock: { now(): Date };
}

// B#128: como la comparación, se envía el municipio, la ubicación o las dos cosas. La ubicación
// solo sirve para elegir las tiendas del radio: no se guarda ni sale en la respuesta (EC-08).
export interface FeaturedProductsInput {
  municipality?: Municipality;
  lat?: number;
  lng?: number;
  radiusKm: number;
  // Código de la lista cerrada de categorías; uno desconocido deja la lista vacía.
  category?: string;
  limit: number;
}

// Un precio vigente del producto en el área, con la tienda donde está.
export interface FeaturedPrice {
  presentationId: string;
  label: string;
  priceCop: number;
  unitPrice: UnitPrice;
  // distanceM solo con la ubicación del usuario.
  establishment: { id: string; name: string; distanceM?: number };
}

export interface FeaturedProduct extends Omit<ProductSummaryView, 'id'> {
  productId: string;
  storeCount: number;
  cheapest: FeaturedPrice;
  // B#128: con dos tiendas o más, el más caro y cuánto menos cuesta el más barato (EC-06).
  priciest?: FeaturedPrice;
  savingsPercent?: number;
}

export interface FeaturedProductsResult {
  // El orden y el área declarados al usuario (EC-06).
  criteria: {
    municipality?: Municipality;
    radiusKm?: number;
    category?: string;
    sort: 'store_count';
  };
  // Tiendas del área con algún precio vigente, de cualquier categoría.
  storesWithPrices: number;
  items: FeaturedProduct[];
}

type Store = EstablishmentDetail & { distanceM?: number };

interface Offer extends RankableOffer {
  price: CurrentPrice;
  presentation: PresentationForPricing;
  establishment: Store;
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

const toPrice = (offer: Offer): FeaturedPrice => ({
  presentationId: offer.presentationId,
  label: offer.presentation.label,
  priceCop: offer.price.priceCop,
  unitPrice: offer.unitPrice,
  establishment: {
    id: offer.establishment.id,
    name: offer.establishment.name,
    ...(offer.establishment.distanceM === undefined
      ? {}
      : { distanceM: offer.establishment.distanceM }),
  },
});

// El más barato y el más caro con la misma cadena de desempates de la comparación (#21), y el
// ahorro entre los dos cuando hay dos tiendas o más.
function pricesOf(offers: Offer[]) {
  const ranked = rankOffers(offers, 'unit_price').offers;
  const cheapest = ranked[0] as Offer;
  const savings = savingsPercent(offers);
  const priciest = ranked.at(-1);
  return {
    storeCount: new Set(offers.map((offer) => offer.establishmentId)).size,
    unitPrice: cheapest.unitPrice,
    cheapest,
    ...(savings === undefined || !priciest ? {} : { priciest, savingsPercent: savings }),
  };
}

// B#120 y B#128 (RF-008, RF-009): la canasta básica de hoy, leída de price_current.
export class FeaturedProducts {
  constructor(private readonly ports: FeaturedProductsPorts) {}

  async of(input: FeaturedProductsInput): Promise<FeaturedProductsResult> {
    const located = input.lat !== undefined && input.lng !== undefined;
    if (!located && input.municipality === undefined) throw new MissingAreaError();
    const offers = await this.offersIn(input);
    const groups = groupByProduct(offers);
    const summaries = await this.ports.products.of([...groups.keys()]);
    const candidates = [...groups]
      .filter(
        ([productId]) =>
          input.category === undefined ||
          summaries.get(productId)?.category.code === input.category,
      )
      .map(([productId, group]) => ({ productId, ...pricesOf(group) }));
    const ranked = rankFeaturedProducts(candidates, input.limit);
    return {
      criteria: {
        ...(input.municipality === undefined ? {} : { municipality: input.municipality }),
        ...(located ? { radiusKm: input.radiusKm } : {}),
        ...(input.category === undefined ? {} : { category: input.category }),
        sort: 'store_count',
      },
      storesWithPrices: new Set(offers.map((offer) => offer.establishmentId)).size,
      items: ranked.flatMap(({ productId, storeCount, cheapest, priciest, savingsPercent }) => {
        const summary = summaries.get(productId);
        if (!summary) return [];
        return [
          {
            productId,
            name: summary.name,
            ...(summary.brand === undefined ? {} : { brand: summary.brand }),
            category: summary.category,
            ...(summary.image === undefined ? {} : { image: summary.image }),
            storeCount,
            cheapest: toPrice(cheapest),
            ...(priciest === undefined || savingsPercent === undefined
              ? {}
              : { priciest: toPrice(priciest), savingsPercent }),
          },
        ];
      }),
    };
  }

  // Las tiendas del área: las del radio si hay ubicación (con su distancia), o las del municipio.
  private storesIn(ids: string[], input: FeaturedProductsInput): Promise<Store[]> {
    const { lat, lng, municipality } = input;
    if (lat !== undefined && lng !== undefined) {
      return this.ports.stores.find({
        ids,
        lat,
        lng,
        radiusMeters: input.radiusKm * 1000,
        ...(municipality === undefined ? {} : { municipality }),
      });
    }
    if (municipality === undefined) throw new MissingAreaError();
    return this.ports.stores.findInMunicipality({ ids, municipality });
  }

  // Los precios vigentes de las tiendas del área, con su presentación y su precio por unidad.
  private async offersIn(input: FeaturedProductsInput): Promise<Offer[]> {
    const { prices, presentations } = this.ports;
    const current = await prices.findAll();
    const [inArea, known] = await Promise.all([
      this.storesIn([...new Set(current.map((price) => price.establishmentId))], input),
      presentations.of([...new Set(current.map((price) => price.presentationId))]),
    ]);
    const storesById = new Map(inArea.map((store) => [store.id, store]));
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
          distanceMeters: establishment.distanceM ?? 0,
          observedAt: price.observedAt,
        },
      ];
    });
  }
}
