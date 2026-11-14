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

  it('un precio fuera de rango queda sospechoso por rango y así se publica', async () => {
    const { observations, published, assess, seedUsual } = setup();
    await seedUsual();

    await assess.execute(reported('ana', 2500));

    expect(observations.saved.at(-1)?.verdict).toMatchObject({
      status: 'sospechoso',
      reason: 'rango',
    });
    expect(published[0]?.payload).toMatchObject({ verdict: 'sospechoso', reason: 'rango' });
  });

  it('cuentas creadas hace días que reportan juntas un precio raro en la tienda quedan sospechosas por coordinación', async () => {
    const { published, assess, seedUsual } = setup();
    await seedUsual();
    const fromNewAccount = (key: string) => reported(key, 1500, { reporterSince: '2026-11-14' });

    await assess.execute(fromNewAccount('nueva-1'));
    await assess.execute(fromNewAccount('nueva-2'));
    await assess.execute(fromNewAccount('nueva-3'));

    expect(published.at(-1)?.payload).toMatchObject({
      verdict: 'sospechoso',
      reason: 'coordinacion',
    });
  });

  it('con menos de 3 cuentas en la tienda usa la zona, sin los reportes que ya están en revisión', async () => {
    const { observations, published, assess } = setup();
    const inNeighbour = (key: string, price: number) =>
      reported(key, price, { establishmentId: 'tienda-vecina' });
    await assess.execute(inNeighbour('beto', 4900));
    await assess.execute(inNeighbour('caro', 5000));
    await assess.execute(inNeighbour('dani', 5100));
    // Un precio raro en la vecina queda en revisión y no debe mover la referencia de la zona.
    await assess.execute(inNeighbour('eli', 900));
    published.length = 0;

    await assess.execute(reported('ana', 2500));

    expect(observations.saved.at(-1)?.verdict).toMatchObject({
      status: 'sospechoso',
      reason: 'rango',
      median: 5000,
      references: 3,
    });
  });

  it('un reporte que coincide con otro sube la reputación de los dos autores, una sola vez por reporte', async () => {
    const { reputations, assess } = setup();

    await assess.execute(reported('ana', 4000));
    await assess.execute(reported('beto', 4050));
    expect(reputations.values.get('ana')).toBeCloseTo(0.55);
    expect(reputations.values.get('beto')).toBeCloseTo(0.55);

    // Caro también coincide: ella sube; los reportes de Ana y Beto ya dieron su punto.
    await assess.execute(reported('caro', 4000));
    expect(reputations.values.get('caro')).toBeCloseTo(0.55);
    expect(reputations.values.get('ana')).toBeCloseTo(0.55);
    expect(reputations.values.get('beto')).toBeCloseTo(0.55);
  });
});
