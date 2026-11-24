export interface DeliveryZone {
  id: string;
  regionId: string;
  sellerId: string;
}

export interface OlimpicaQuote {
  regionId: string;
  sellerId: string;
  skuId: string;
  available: boolean;
  priceCop?: number;
}

interface PreviewPorts {
  findPresentations(ean: string): Promise<string[]>;
  quote(ean: string, zone: DeliveryZone): Promise<OlimpicaQuote>;
  now(): Date;
}

const VALIDITY_MS = 48 * 60 * 60 * 1000;

export class PreviewOlimpica {
  constructor(private readonly ports: PreviewPorts) {}

  async execute(zone: DeliveryZone, eans: string[]) {
    const rows = [];
    for (const ean of eans) {
      rows.push(await this.inspect(ean, zone));
    }
    return { mode: 'preview' as const, zoneId: zone.id, rows };
  }

  private async inspect(ean: string, zone: DeliveryZone) {
    const ids = await this.ports.findPresentations(ean);
    const [presentationId] = ids;
    if (ids.length !== 1 || presentationId === undefined) {
      return {
        ean,
        status: 'skipped' as const,
        reason: ids.length === 0 ? 'unknown_ean' : 'ambiguous_ean',
      };
    }
    const quote = await this.ports.quote(ean, zone);
    const observedAt = this.ports.now();
    return {
      ean,
      presentationId,
      status: 'available' as const,
      skuId: quote.skuId,
      sellerId: quote.sellerId,
      priceCop: quote.priceCop,
      observedAt,
      expiresAt: new Date(observedAt.getTime() + VALIDITY_MS),
    };
  }
}
