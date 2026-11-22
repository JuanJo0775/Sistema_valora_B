import {
  type ReliabilityLevel,
  reliabilityLevel,
  reliabilityScore,
} from '../../../domain/reliability';
import type { ScoredReport } from '../../../domain/report-window';
import { isReliable } from './standing';
import type { Observation, ObservationStore, ReputationStore } from './stores';

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

// Un reporte de la tienda con su nivel, para compararlo con el precio oficial (#204).
export interface ReportAtStore {
  reportId: string;
  priceCop: number;
  observedAt: Date;
  level: ReliabilityLevel;
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
    const results: PriceReliability[] = [];
    for (const price of prices) {
      const inStore = await this.ports.observations.forPresentation(price.presentationId, [
        price.establishmentId,
      ]);
      const candidate = inStore.find((seen) => seen.reportId === price.reportId);
      if (!candidate) continue;
      const { level, confirmations } = await this.score(candidate, inStore, ttlDays);
      results.push({ ...price, level, confirmations });
    }
    return results;
  }

  // D1 del grill comercial (#204): los reportes de la tienda, uno por persona (el más reciente, así
  // son independientes), con su nivel. Sin la clave de quien reportó (EC-08).
  async reportsAt(
    presentationId: string,
    establishmentId: string,
    ttlDays: number,
  ): Promise<ReportAtStore[]> {
    const inStore = await this.ports.observations.forPresentation(presentationId, [
      establishmentId,
    ]);
    const latest = new Map<string, Observation>();
    // Solo el precio normal: una oferta es temporal y no contradice al oficial.
    const comparable = inStore.filter((seen) => isReliable(seen) && seen.priceType === 'normal');
    for (const seen of comparable) {
      const current = latest.get(seen.reporterKey);
      if (!current || seen.observedAt > current.observedAt) latest.set(seen.reporterKey, seen);
    }
    const results: ReportAtStore[] = [];
    for (const seen of latest.values()) {
      const { level } = await this.score(seen, inStore, ttlDays);
      results.push({
        reportId: seen.reportId,
        priceCop: seen.priceCop,
        observedAt: seen.observedAt,
        level,
      });
    }
    return results;
  }

  private async score(
    candidate: Observation,
    inStore: Observation[],
    ttlDays: number,
  ): Promise<{ level: ReliabilityLevel; confirmations: number }> {
    // Los que están en revisión o descartados no confirman ni contradicen un precio.
    const others = inStore.filter((seen) => seen !== candidate && isReliable(seen));
    const reputations = await this.ports.reputations.valuesOf(
      [candidate, ...others].map((seen) => seen.reporterKey),
    );
    const { score, corroborations } = reliabilityScore({
      candidate: toScored(candidate),
      others: others.map(toScored),
      reputationOf: (key) => reputations.get(key) ?? 0.5,
      now: this.ports.clock.now(),
      ttlDays,
    });
    return { level: reliabilityLevel(score), confirmations: corroborations };
  }
}
