import { assessAnomaly } from '../../../domain/anomaly';
import { ttlDaysFor } from '../../../domain/freshness';
import type { ScoredReport } from '../../../domain/report-window';
import { createEvent, type DomainEvent } from '../../../shared/events';
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
    const inStore = await observations.forPresentation(reported.presentationId, [
      reported.establishmentId,
    ]);
    // Pregunta 7: las otras tiendas de la zona, sin los reportes que ya están en revisión.
    const neighbours = (await zone.around(reported.establishmentId)).filter(
      (id) => id !== reported.establishmentId,
    );
    const inZone = (await observations.forPresentation(reported.presentationId, neighbours)).filter(
      (seen) => seen.verdict.status !== 'sospechoso',
    );
    const since = new Map(
      [...inStore, ...inZone].map((seen) => [seen.reporterKey, seen.reporterSince]),
    );
    since.set(observation.reporterKey, observation.reporterSince);

    const verdict = assessAnomaly({
      candidate: toScored(observation),
      others: inStore.map(toScored),
      zone: inZone.map(toScored),
      now: observation.receivedAt,
      ttlDays: ttlDaysFor((await freshness.isFresh(reported.presentationId)) ?? false),
      accountCreatedAt: (key) => since.get(key) ?? observation.reporterSince,
    });
    await observations.save({ ...observation, verdict });

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
}
