import type { AnomalyResult } from '../../../domain/anomaly';
import { ModerationQueue } from './moderation-queue';
import type { Observation, PendingItem } from './stores';

const minutesAgo = (minutes: number) => new Date(Date.UTC(2026, 10, 14, 14) - minutes * 60_000);

const suspicious = (deviation: number): AnomalyResult => ({
  status: 'sospechoso',
  reason: 'rango',
  median: 4000,
  deviation,
  references: 3,
});

let sequence = 0;
// Elemento pendiente de prueba en la tienda de don José, con el arroz de 500 g.
const pending = (verdict: AnomalyResult, flags = 0, receivedMinutesAgo = 10): PendingItem => {
  sequence += 1;
  const observation: Observation = {
    reportId: `reporte-${String(sequence)}`,
    presentationId: 'arroz-500g',
    establishmentId: 'don-jose',
    reporterKey: 'clave-del-autor',
    reporterSince: new Date('2025-01-01'),
    priceCop: 2000,
    priceType: 'normal',
    observedAt: minutesAgo(receivedMinutesAgo),
    receivedAt: minutesAgo(receivedMinutesAgo),
    verdict,
  };
  return { observation, flags };
};

function setup(items: PendingItem[]) {
  return new ModerationQueue({
    moderation: { pending: () => Promise.resolve(items) },
    labels: { of: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'Arroz Diana · 500 g']))) },
    names: { of: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'Don José']))) },
  });
}

describe('cola de moderación (RF-013)', () => {
  it('muestra los sospechosos y los marcados pendientes, con nombres y sin datos de las cuentas', async () => {
    const detected = pending(suspicious(0.5), 2);
    const flagged = pending({ status: 'sin_datos', references: 1 }, 1);

    const queue = await setup([detected, flagged]).list({});

    expect(queue).toEqual([
      {
        id: detected.observation.reportId,
        reason: 'desviacion',
        productName: 'Arroz Diana · 500 g',
        establishmentName: 'Don José',
        reportedPriceCop: 2000,
        medianPriceCop: 4000,
        deviationPercent: 50,
        reportersCount: 2,
        createdAt: detected.observation.receivedAt,
      },
      {
        id: flagged.observation.reportId,
        reason: 'marcado',
        productName: 'Arroz Diana · 500 g',
        establishmentName: 'Don José',
        reportedPriceCop: 2000,
        reportersCount: 1,
        createdAt: flagged.observation.receivedAt,
      },
    ]);
    expect(JSON.stringify(queue)).not.toContain('clave-del-autor');
  });
});
