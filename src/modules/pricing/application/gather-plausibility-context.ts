import type { Municipality } from '../../../domain/municipality';
import { type FallbackReference, wholesaleTotalCop } from '../../../domain/price-plausibility';
import type { Unit } from '../../../domain/unit-price';
import { acceptsWholesaleReference, isRecentReference } from '../../../domain/wholesale-reference';
import type { PlausibilityContext } from './register-report';

type PriceType = 'normal' | 'oferta';

interface ReportPlace {
  presentationId: string;
  establishmentId: string;
  priceType: PriceType;
}

// Puertos hacia establishments, comparison y catalog (por sus index.ts) y el reloj.
export interface GatherPlausibilityContextPorts {
  stores: { find(establishmentId: string): Promise<{ municipality: Municipality } | null> };
  inMunicipality: {
    findInMunicipality(query: {
      ids: string[];
      municipality: Municipality;
    }): Promise<{ id: string }[]>;
  };
  peers: {
    vigentesOf(
      presentationId: string,
      priceType: PriceType,
    ): Promise<{ establishmentId: string; priceCop: number }[]>;
  };
  presentations: {
    of(
      presentationIds: string[],
    ): Promise<Map<string, { productId: string; quantity: number; unit: Unit; packCount: number }>>;
  };
  references: {
    latestFor(productId: string): Promise<{ pricePerKgCop: number; periodEnd: string } | null>;
  };
  clock: { now(): Date };
}

// ADR-030: lo que Valora sabe del precio de una presentación fuera de las cuentas de la tienda:
// (b) los precios vigentes en otras tiendas del mismo municipio y (c) el mayorista SIPSA de la
// presentación completa. Son pocas consultas por reporte, sin importar cuántas tiendas haya.
export class GatherPlausibilityContext implements PlausibilityContext {
  constructor(private readonly ports: GatherPlausibilityContextPorts) {}

  async of(report: ReportPlace): Promise<FallbackReference> {
    const [peerPricesCop, wholesale] = await Promise.all([
      this.peerPrices(report),
      this.wholesale(report.presentationId),
    ]);
    return { peerPricesCop, wholesaleTotalCop: wholesale };
  }

  private async peerPrices(report: ReportPlace): Promise<number[]> {
    const { stores, inMunicipality, peers } = this.ports;
    const others = (await peers.vigentesOf(report.presentationId, report.priceType)).filter(
      (price) => price.establishmentId !== report.establishmentId,
    );
    if (others.length === 0) return [];
    const store = await stores.find(report.establishmentId);
    if (!store) return [];
    const inSameMunicipality = new Set(
      (
        await inMunicipality.findInMunicipality({
          ids: others.map((price) => price.establishmentId),
          municipality: store.municipality,
        })
      ).map((found) => found.id),
    );
    return others
      .filter((price) => inSameMunicipality.has(price.establishmentId))
      .map((price) => price.priceCop);
  }

  private async wholesale(presentationId: string): Promise<number | null> {
    const { presentations, references, clock } = this.ports;
    const presentation = (await presentations.of([presentationId])).get(presentationId);
    if (!presentation || !acceptsWholesaleReference(presentation.unit)) return null;
    const reference = await references.latestFor(presentation.productId);
    if (!reference || !isRecentReference(reference.periodEnd, clock.now())) return null;
    return wholesaleTotalCop(reference.pricePerKgCop, presentation);
  }
}
