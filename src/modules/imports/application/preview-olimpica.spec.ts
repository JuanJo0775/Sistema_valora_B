import { PreviewOlimpica } from './preview-olimpica';

const observedAt = new Date('2026-11-23T15:00:00Z');
const ean = '7702552000097';
const zone = { id: 'armenia-piloto', regionId: 'region-1', sellerId: 'seller-1' };
const quote = {
  regionId: zone.regionId,
  sellerId: zone.sellerId,
  skuId: '516338',
  available: true,
  priceCop: 1950,
};

it('muestra el precio disponible de un EAN único en la zona confirmada', async () => {
  const pilot = new PreviewOlimpica({
    findPresentations: () => Promise.resolve(['p1']),
    quote: () => Promise.resolve(quote),
    now: () => observedAt,
  });
  await expect(pilot.execute(zone, [ean])).resolves.toEqual({
    mode: 'preview',
    zoneId: zone.id,
    rows: [
      {
        ean,
        presentationId: 'p1',
        status: 'available',
        skuId: '516338',
        sellerId: zone.sellerId,
        priceCop: 1950,
        observedAt,
        expiresAt: new Date('2026-11-25T15:00:00Z'),
      },
    ],
  });
});

it.each([
  [[], 'unknown_ean'],
  [['p1', 'p2'], 'ambiguous_ean'],
] satisfies [string[], string][])(
  'omite EAN con coincidencias %j y motivo %s',
  async (ids, reason) => {
    const pilot = new PreviewOlimpica({
      findPresentations: () => Promise.resolve(ids),
      quote: () => Promise.reject(new Error('No debe consultar el proveedor')),
      now: () => observedAt,
    });
    await expect(pilot.execute(zone, [ean])).resolves.toMatchObject({
      rows: [{ ean, status: 'skipped', reason }],
    });
  },
);

it.each([{ regionId: '' }, { sellerId: 'otro' }])(
  'omite una oferta con contexto no corroborado %j',
  async (context) => {
    const pilot = new PreviewOlimpica({
      findPresentations: () => Promise.resolve(['p1']),
      quote: () => Promise.resolve({ ...quote, ...context }),
      now: () => observedAt,
    });
    await expect(pilot.execute(zone, [ean])).resolves.toMatchObject({
      rows: [{ ean, status: 'skipped', reason: 'unverified_zone' }],
    });
  },
);

it('informa una oferta indisponible en la zona aunque VTEX devuelva un precio', async () => {
  const pilot = new PreviewOlimpica({
    findPresentations: () => Promise.resolve(['p1']),
    quote: () => Promise.resolve({ ...quote, available: false }),
    now: () => observedAt,
  });
  const result = await pilot.execute(zone, [ean]);
  expect(result.rows).toEqual([
    {
      ean,
      presentationId: 'p1',
      status: 'unavailable',
      skuId: '516338',
      sellerId: zone.sellerId,
      observedAt,
    },
  ]);
});
