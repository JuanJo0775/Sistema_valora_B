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

  // RN2 de RF-013 y grill de la #32, pregunta 6.
  it('ordena por gravedad: mayor desviación, luego más marcas y, en empate, el más antiguo', async () => {
    const small = pending(suspicious(0.45));
    const large = pending(suspicious(0.8));
    const oneFlag = pending({ status: 'sin_datos', references: 0 }, 1, 5);
    const olderOneFlag = pending({ status: 'sin_datos', references: 0 }, 1, 30);
    const threeFlags = pending({ status: 'sin_datos', references: 0 }, 3);

    const queue = await setup([oneFlag, small, threeFlags, olderOneFlag, large]).list({});

    expect(queue.map((item) => item.id)).toEqual(
      [large, small, threeFlags, olderOneFlag, oneFlag].map((item) => item.observation.reportId),
    );
  });

  it('filtra por motivo y respeta el límite, 20 por defecto', async () => {
    const detected = Array.from({ length: 22 }, (_, index) => pending(suspicious(0.5), 0, index));
    const flagged = pending({ status: 'sin_datos', references: 0 }, 1);
    const queue = setup([...detected, flagged]);

    await expect(queue.list({ reason: 'marcado' })).resolves.toHaveLength(1);
    await expect(queue.list({ reason: 'desviacion', limit: 3 })).resolves.toHaveLength(3);
    await expect(queue.list({})).resolves.toHaveLength(20);
  });

  it('si catalog o establishments no dan el nombre, la cola dice «Sin nombre»', async () => {
    const queue = new ModerationQueue({
      moderation: { pending: () => Promise.resolve([pending(suspicious(0.5))]) },
      labels: { of: () => Promise.resolve(new Map()) },
      names: { of: () => Promise.resolve(new Map()) },
    });

    const [item] = await queue.list({});

    expect(item).toMatchObject({ productName: 'Sin nombre', establishmentName: 'Sin nombre' });
  });
});
