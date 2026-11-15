import { assessAnomaly } from '../../../domain/anomaly';
import { ttlDaysFor } from '../../../domain/freshness';
import { RELIABILITY_PARAMS, updateReputation } from '../../../domain/reliability';
import { comparableReports, type ScoredReport } from '../../../domain/report-window';
import { createEvent, type DomainEvent } from '../../../shared/events';
import { isDiscarded, isReliable, isUnderReview } from './standing';
import type { Observation, ObservationStore, ReputationStore } from './stores';

// Datos de PriceReported versión 2 (grill de la #31, pregunta 2).
export interface PriceReportedV2 {
  reportId: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  priceType: 'normal' | 'oferta';
  observedAt: string;
  receivedAt: string;
  reporterKey: string;
  reporterSince: string;
}

export interface AssessReportedPricePorts {
  observations: ObservationStore;
  reputations: ReputationStore;
  // Puertos hacia establishments y catalog (por su index.ts) y hacia el outbox.
  zone: { around(establishmentId: string): Promise<string[]> };
  freshness: { isFresh(presentationId: string): Promise<boolean | null> };
  events: { publish(event: DomainEvent): Promise<void> };
}

export const PRICE_ASSESSED = 'PriceAssessed';

const toScored = (observation: Omit<Observation, 'verdict'>): ScoredReport => ({
  reporterKey: observation.reporterKey,
  priceCop: observation.priceCop,
  priceType: observation.priceType,
  observedAt: observation.observedAt,
});

// Suscriptor de PriceReported v2: evalúa el precio con las reglas del dominio, lo guarda y avisa a
// comparison con PriceAssessed (grill de la #31, preguntas 3 y 4).
export class AssessReportedPrice {
  constructor(private readonly ports: AssessReportedPricePorts) {}

  async execute(reported: PriceReportedV2): Promise<void> {
    const { observations, freshness, events, zone } = this.ports;
    const observation: Omit<Observation, 'verdict'> = {
      reportId: reported.reportId,
      presentationId: reported.presentationId,
      establishmentId: reported.establishmentId,
      reporterKey: reported.reporterKey,
      reporterSince: new Date(reported.reporterSince),
      priceCop: reported.priceCop,
      priceType: reported.priceType,
      observedAt: new Date(reported.observedAt),
      receivedAt: new Date(reported.receivedAt),
    };
    const inStore = (
      await observations.forPresentation(reported.presentationId, [reported.establishmentId])
    ).filter((seen) => !isDiscarded(seen));
    // Pregunta 7: las otras tiendas de la zona, sin los reportes que ya están en revisión.
    const neighbours = (await zone.around(reported.establishmentId)).filter(
      (id) => id !== reported.establishmentId,
    );
    const inZone = (await observations.forPresentation(reported.presentationId, neighbours)).filter(
      isReliable,
    );
    const since = new Map(
      [...inStore, ...inZone].map((seen) => [seen.reporterKey, seen.reporterSince]),
    );
    since.set(observation.reporterKey, observation.reporterSince);

    const ttlDays = ttlDaysFor((await freshness.isFresh(reported.presentationId)) ?? false);
    const verdict = assessAnomaly({
      candidate: toScored(observation),
      // Calibración de la #67: en la tienda, los que ya están en revisión forman grupo pero no
      // entran a la mediana; en la zona no cuentan.
      others: inStore.filter(isReliable).map(toScored),
      flagged: inStore.filter(isUnderReview).map(toScored),
      zone: inZone.map(toScored),
      now: observation.receivedAt,
      ttlDays,
      accountCreatedAt: (key) => since.get(key) ?? observation.reporterSince,
    });
    await observations.save({ ...observation, verdict });
    // Un sospechoso no da ni recibe reputación: un grupo coordinado no se infla entre sus cuentas.
    if (verdict.status !== 'sospechoso') {
      const trusted = inStore.filter(isReliable);
      await this.rewardCorroboration(observation, trusted, ttlDays);
    }

    await events.publish(
      createEvent(PRICE_ASSESSED, 1, {
        reportId: reported.reportId,
        presentationId: reported.presentationId,
        establishmentId: reported.establishmentId,
        priceCop: reported.priceCop,
        priceType: reported.priceType,
        observedAt: reported.observedAt,
        receivedAt: reported.receivedAt,
        verdict: verdict.status,
        reason: verdict.status === 'sospechoso' ? verdict.reason : null,
      }),
    );
  }

  // Pregunta 8: si otras cuentas de la tienda coinciden con el reporte, ganan el autor nuevo y los de
  // los reportes que coinciden; cada reporte da su punto una sola vez.
  private async rewardCorroboration(
    observation: Omit<Observation, 'verdict'>,
    inStore: Observation[],
    ttlDays: number,
  ): Promise<void> {
    const scored = new Map(inStore.map((seen) => [toScored(seen), seen]));
    const candidate = toScored(observation);
    const agreeing = comparableReports({
      candidate,
      others: [...scored.keys()],
      now: observation.receivedAt,
      ttlDays,
    }).filter(
      (other) =>
        Math.abs(other.priceCop - candidate.priceCop) / candidate.priceCop <=
        RELIABILITY_PARAMS.corroborationTolerance,
    );
    if (agreeing.length === 0) return;
    const rewarded = [observation, ...agreeing.flatMap((other) => scored.get(other) ?? [])];
    const { reputations } = this.ports;
    const current = await reputations.valuesOf(rewarded.map((seen) => seen.reporterKey));
    for (const seen of rewarded) {
      if (!(await reputations.claimPoint(seen.reportId, seen.reporterKey))) continue;
      const value = current.get(seen.reporterKey) ?? RELIABILITY_PARAMS.neutralReputation;
      const updated = updateReputation(value, 'corroborated');
      current.set(seen.reporterKey, updated);
      await reputations.save(seen.reporterKey, updated);
    }
  }
}
