import {
  type ReliabilityLevel,
  reliabilityLevel,
  reliabilityScore,
} from '../../../domain/reliability';
import type { ScoredReport } from '../../../domain/report-window';
import { isReliable } from './standing';
import type { ObservationStore, ReputationStore } from './stores';

export interface PriceRef {
  presentationId: string;
  establishmentId: string;
  // El reporte que está vigente en price_current para esa tienda.
  reportId: string;
}

export interface PriceReliability extends PriceRef {
  level: ReliabilityLevel;
  confirmations: number;
}

export interface ReliabilityOfPricesPorts {
  observations: ObservationStore;
  reputations: ReputationStore;
  clock: { now(): Date };
}

const toScored = (seen: ScoredReport): ScoredReport => ({
  reporterKey: seen.reporterKey,
  priceCop: seen.priceCop,
  priceType: seen.priceType,
  observedAt: seen.observedAt,
});

// Grill de la #31, pregunta 6: el score cambia con el tiempo, así que se calcula al leer con las
// observaciones y la reputación guardadas.
export class ReliabilityOfPrices {
  constructor(private readonly ports: ReliabilityOfPricesPorts) {}

  async of(prices: PriceRef[], ttlDays: number): Promise<PriceReliability[]> {
    const now = this.ports.clock.now();
    const results: PriceReliability[] = [];
    for (const price of prices) {
      const inStore = await this.ports.observations.forPresentation(price.presentationId, [
        price.establishmentId,
      ]);
      const candidate = inStore.find((seen) => seen.reportId === price.reportId);
      if (!candidate) continue;
      // Los que están en revisión o descartados no confirman ni contradicen un precio.
      const others = inStore.filter((seen) => seen !== candidate && isReliable(seen));
      const reputations = await this.ports.reputations.valuesOf(
        [candidate, ...others].map((seen) => seen.reporterKey),
      );
      const { score, corroborations } = reliabilityScore({
        candidate: toScored(candidate),
        others: others.map(toScored),
        reputationOf: (key) => reputations.get(key) ?? 0.5,
        now,
        ttlDays,
      });
      results.push({ ...price, level: reliabilityLevel(score), confirmations: corroborations });
    }
    return results;
  }
}
