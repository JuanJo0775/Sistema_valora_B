import type { DeliveryZone, OlimpicaQuote } from '../application/preview-olimpica';

const ORIGIN = 'https://www.olimpica.com';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : {};
}

function list(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}

export class OlimpicaVtex {
  constructor(
    private readonly postalCode: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async confirms(zone: DeliveryZone): Promise<boolean> {
    const responses = list(
      await this.json(
        '/api/checkout/pub/regions?' +
          new URLSearchParams({ country: 'COL', postalCode: this.postalCode }).toString(),
      ),
    );
    return responses.some(
      (region) =>
        region.id === zone.regionId &&
        list(region.sellers).some((seller) => seller.id === zone.sellerId),
    );
  }

  async quote(ean: string, zone: DeliveryZone): Promise<OlimpicaQuote> {
    const products = list(
      await this.json(
        '/api/catalog_system/pub/products/search?' +
          new URLSearchParams({ fq: 'alternateIds_Ean:' + ean }).toString(),
      ),
    );
    const ids = new Set(
      products
        .flatMap((product) => list(product.items))
        .filter(
          (item) => item.ean === ean && typeof item.itemId === 'string' && item.itemId.length > 0,
        )
        .map((item) => String(item.itemId)),
    );
    if (ids.size !== 1) throw new Error('invalid_response');
    const [skuId] = ids;
    if (skuId === undefined) throw new Error('invalid_response');
    const result = object(
      await this.json('/api/checkout/pub/orderForms/simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: skuId, quantity: 1, seller: zone.sellerId }],
          postalCode: this.postalCode,
          country: 'COL',
        }),
      }),
    );
    const items = list(result.items);
    const item = items[0];
    const regionId =
      result.country === 'COL' && result.postalCode === this.postalCode ? zone.regionId : '';
    if (!item || items.length !== 1 || item.id !== skuId || typeof item.seller !== 'string') {
      throw new Error('invalid_response');
    }
    const logistics = list(result.logisticsInfo);
    const delivery = logistics.some(
      (entry) =>
        entry.itemIndex === 0 && list(entry.slas).some((sla) => sla.deliveryChannel === 'delivery'),
    );
    if (item.availability !== 'available' && item.availability !== 'withoutStock') {
      throw new Error('invalid_response');
    }
    const base = { skuId, sellerId: item.seller, regionId };
    if (item.availability === 'withoutStock') return { ...base, available: false };
    if (!delivery) throw new Error('invalid_response');
    return {
      ...base,
      available: true,
      priceCop: typeof item.sellingPrice === 'number' ? item.sellingPrice / 100 : undefined,
    };
  }

  private async json(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(ORIGIN + path, {
      ...init,
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('provider_error');
    try {
      return await response.json();
    } catch {
      throw new Error('invalid_response');
    }
  }
}
