import { applyOlimpica, type OnlineObservation } from './apply-olimpica';

const observedAt = new Date('2026-11-24T15:00:00Z');
const quote = {
  status: 'available' as const,
  observedAt,
  priceCop: 1950,
  skuId: 's1',
  sellerId: 'v1',
  expiresAt: new Date('2026-11-26T15:00:00Z'),
};
const first = { ...quote, ean: '7702552000097', presentationId: 'p1' };
const second = { ...quote, ean: '7702511000014', presentationId: 'p2' };

it('aplica cada observación válida y conserva los demás resultados si una escritura falla', async () => {
  const saved: OnlineObservation[] = [];
  const result = await applyOlimpica(
    {
      mode: 'preview',
      zoneId: 'armenia-piloto',
      rows: [first, second, { ean: '7701018007151', status: 'skipped', reason: 'unknown_ean' }],
    },
    'run1',
    (observation) => {
      if (observation.presentationId === 'p1')
        return Promise.reject(new Error('Falló la escritura'));
      saved.push(observation);
      return Promise.resolve(observation);
    },
  );
  expect(saved).toEqual([
    { ...second, source: 'olimpica_vtex', zoneId: 'armenia-piloto', runId: 'run1' },
  ]);
  expect(result).toMatchObject({
    mode: 'apply',
    runId: 'run1',
    rows: [
      { ean: first.ean, status: 'failed', reason: 'persistence_error' },
      second,
      { ean: '7701018007151', status: 'skipped', reason: 'unknown_ean' },
    ],
  });
});
