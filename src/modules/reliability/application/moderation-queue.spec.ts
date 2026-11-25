import type { AnomalyResult } from '../../../domain/anomaly';
import { ModerationQueue } from './moderation-queue';
import type { Observation, OfficialReview, PendingItem } from './stores';

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

function setup(items: PendingItem[], reviews: OfficialReview[] = []) {
  return new ModerationQueue({
    moderation: { pending: () => Promise.resolve(items) },
    officialReviews: { pending: () => Promise.resolve(reviews) },
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
        deviationDirection: 'menor',
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

  // H25: deviationPercent va en valor absoluto; la dirección viaja aparte para no depender del cliente.
  it('dice si el precio reportado está por debajo o por encima de la mediana (H25)', async () => {
    const below = pending(suspicious(0.5));
    const above = {
      ...pending(suspicious(0.5)),
      observation: { ...pending(suspicious(0.5)).observation, priceCop: 6000 },
    };
    const same = {
      ...pending({ status: 'sin_datos', references: 0 }, 1),
      observation: {
        ...pending(suspicious(0)).observation,
        priceCop: 4000,
        verdict: suspicious(0),
      },
    };
    const noMedian = pending({ status: 'sin_datos', references: 0 }, 1);

    const queue = await setup([below, above, same, noMedian]).list({});

    const direction = (item: PendingItem) =>
      queue.find((found) => found.id === item.observation.reportId)?.deviationDirection;
    expect(direction(below)).toBe('menor');
    expect(direction(above)).toBe('mayor');
    // Sin diferencia o sin mediana no hay dirección: el campo no aparece.
    expect(queue.find((found) => found.id === same.observation.reportId)).not.toHaveProperty(
      'deviationDirection',
    );
    expect(queue.find((found) => found.id === noMedian.observation.reportId)).not.toHaveProperty(
      'deviationDirection',
    );
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
      officialReviews: { pending: () => Promise.resolve([]) },
      labels: { of: () => Promise.resolve(new Map()) },
      names: { of: () => Promise.resolve(new Map()) },
    });

    const [item] = await queue.list({});

    expect(item).toMatchObject({ productName: 'Sin nombre', establishmentName: 'Sin nombre' });
  });

  // Grill de la #71, pregunta 3.
  it('una apelación aparece primero, con el motivo del autor y sin quién descartó', async () => {
    const detected = pending(suspicious(0.9), 3);
    const appealed: PendingItem = {
      ...pending(suspicious(0.5)),
      appeal: { note: 'El precio sí era ese', createdAt: minutesAgo(1) },
    };
    appealed.observation.moderation = 'descartado';

    const queue = await setup([detected, appealed]).list({});

    expect(queue[0]).toMatchObject({
      id: appealed.observation.reportId,
      reason: 'apelacion',
      appealNote: 'El precio sí era ese',
    });
    expect(queue.map((item) => item.reason)).toEqual(['apelacion', 'desviacion']);
    await expect(setup([detected, appealed]).list({ reason: 'apelacion' })).resolves.toHaveLength(
      1,
    );
  });

  // Grill de la #29, pregunta 3 (RF-012 RN2).
  it('una ráfaga aparece con su motivo, después de las desviaciones y antes de las marcas', async () => {
    const flagged = pending({ status: 'sin_datos', references: 0 }, 2);
    const burst: PendingItem = { ...pending({ status: 'sin_datos', references: 0 }), burst: true };
    const detected = pending(suspicious(0.6));

    const queue = await setup([flagged, burst, detected]).list({});

    expect(queue.map((item) => item.reason)).toEqual(['desviacion', 'rafaga', 'marcado']);
    await expect(setup([flagged, burst]).list({ reason: 'rafaga' })).resolves.toHaveLength(1);
  });

  // ADR-037: un precio oficial sin referencia con qué compararlo entra a la cola con su propio motivo.
  describe('precios oficiales sin referencia (ADR-037)', () => {
    const official = (reviewId: string, minutes: number): OfficialReview => ({
      reviewId,
      presentationId: 'arroz-500g',
      establishmentId: 'don-jose',
      reporterKey: 'clave-del-comercio',
      priceCop: 300,
      receivedAt: minutesAgo(minutes),
    });

    it('aparece como «sin_referencia», sin mediana ni desviación y sin quién lo publicó', async () => {
      const queue = await setup([], [official('revision-1', 5)]).list({});

      expect(queue).toEqual([
        {
          id: 'revision-1',
          reason: 'sin_referencia',
          productName: 'Arroz Diana · 500 g',
          establishmentName: 'Don José',
          reportedPriceCop: 300,
          reportersCount: 0,
          createdAt: minutesAgo(5),
        },
      ]);
    });

    it('va después de las apelaciones y las desviaciones y antes de las ráfagas y las marcas', async () => {
      const detected = pending(suspicious(0.5));
      const flagged = pending({ status: 'sin_datos', references: 0 }, 1);
      const burst: PendingItem = {
        ...pending({ status: 'sin_datos', references: 0 }),
        burst: true,
      };

      const queue = await setup([flagged, burst, detected], [official('revision-1', 5)]).list({});

      expect(queue.map((item) => item.reason)).toEqual([
        'desviacion',
        'sin_referencia',
        'rafaga',
        'marcado',
      ]);
    });

    it('entre varios, el que llegó antes va primero', async () => {
      const queue = await setup([], [official('reciente', 1), official('antiguo', 30)]).list({});

      expect(queue.map((item) => item.id)).toEqual(['antiguo', 'reciente']);
    });

    it('se filtra por motivo y respeta el límite', async () => {
      const reviews = [official('a', 3), official('b', 2), official('c', 1)];
      const queue = setup([pending(suspicious(0.5))], reviews);

      await expect(queue.list({ reason: 'sin_referencia' })).resolves.toHaveLength(3);
      await expect(queue.list({ reason: 'sin_referencia', limit: 2 })).resolves.toHaveLength(2);
      await expect(queue.list({ reason: 'desviacion' })).resolves.toHaveLength(1);
      await expect(queue.list({ limit: 2 })).resolves.toHaveLength(2);
    });
  });
});
