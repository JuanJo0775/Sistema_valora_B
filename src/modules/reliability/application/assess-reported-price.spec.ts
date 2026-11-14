import type { DomainEvent } from '../../../shared/events';
import { AssessReportedPrice, type PriceReportedV2 } from './assess-reported-price';
import type { Observation, ObservationStore, ReputationStore } from './stores';

const now = new Date('2026-11-14T14:00:00Z');
const store = 'tienda-centro';
const presentation = 'arroz-500g';

let sequence = 0;
// Reporte de prueba en la tienda del centro: precio normal, recién visto, de una cuenta antigua.
const reported = (
  reporterKey: string,
  priceCop: number,
  change: Partial<PriceReportedV2> = {},
): PriceReportedV2 => {
  sequence += 1;
  return {
    reportId: `reporte-${String(sequence)}`,
    presentationId: presentation,
    establishmentId: store,
    priceCop,
    priceType: 'normal',
    observedAt: now.toISOString(),
    receivedAt: now.toISOString(),
    reporterKey,
    reporterSince: '2025-01-01',
    ...change,
  };
};

class InMemoryObservations implements ObservationStore {
  readonly saved: Observation[] = [];

  forPresentation(presentationId: string, establishmentIds: string[]): Promise<Observation[]> {
    return Promise.resolve(
      this.saved.filter(
        (observation) =>
          observation.presentationId === presentationId &&
          establishmentIds.includes(observation.establishmentId),
      ),
    );
  }

  save(observation: Observation): Promise<void> {
    this.saved.push(observation);
    return Promise.resolve();
  }
}

class InMemoryReputations implements ReputationStore {
  readonly values = new Map<string, number>();
  readonly claimed = new Set<string>();

  valuesOf(keys: string[]): Promise<Map<string, number>> {
    return Promise.resolve(
      new Map(
        keys.flatMap((key) => (this.values.has(key) ? [[key, this.values.get(key) ?? 0]] : [])),
      ),
    );
  }

  claimPoint(reportId: string): Promise<boolean> {
    if (this.claimed.has(reportId)) return Promise.resolve(false);
    this.claimed.add(reportId);
    return Promise.resolve(true);
  }

  save(reporterKey: string, value: number): Promise<void> {
    this.values.set(reporterKey, value);
    return Promise.resolve();
  }
}

// Zona de prueba: la tienda del centro y una vecina.
function setup() {
  const observations = new InMemoryObservations();
  const reputations = new InMemoryReputations();
  const published: DomainEvent[] = [];
  const assess = new AssessReportedPrice({
    observations,
    reputations,
    zone: { around: () => Promise.resolve([store, 'tienda-vecina']) },
    freshness: { isFresh: () => Promise.resolve(false) },
    events: {
      publish: (event) => {
        published.push(event);
        return Promise.resolve();
      },
    },
  });
  // Tres cuentas antiguas ya reportaron cerca de 5000 en la tienda del centro.
  const seedUsual = async () => {
    for (const [key, price] of [
      ['beto', 4900],
      ['caro', 5000],
      ['dani', 5100],
    ] as const) {
      await assess.execute(reported(key, price));
    }
    published.length = 0;
  };
  return { observations, reputations, published, assess, seedUsual };
}

describe('evaluar un precio reportado (reliability)', () => {
  it('un precio cerca de la mediana de la tienda queda normal, se guarda y se publica PriceAssessed', async () => {
    const { observations, published, assess, seedUsual } = setup();
    await seedUsual();
    const report = reported('ana', 4800);

    await assess.execute(report);

    expect(observations.saved.at(-1)).toMatchObject({
      reportId: report.reportId,
      reporterKey: 'ana',
      verdict: { status: 'normal', median: 5000 },
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: 'PriceAssessed',
      version: 1,
      payload: { reportId: report.reportId, priceCop: 4800, verdict: 'normal', reason: null },
    });
    expect(published[0]?.payload).not.toHaveProperty('reporterKey');
  });
});
