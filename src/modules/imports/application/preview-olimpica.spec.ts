import { PreviewOlimpica } from './preview-olimpica';

const observedAt = new Date('2026-11-23T15:00:00Z');
const ean = '7702552000097';
const zone = { id: 'armenia-piloto', regionId: 'region-1', sellerId: 'seller-1' };
const quote = { regionId: zone.regionId, sellerId: zone.sellerId, skuId: '516338', available: true, priceCop: 1950 };

it('muestra el precio disponible de un EAN único en la zona confirmada', async () => {
  const pilot = new PreviewOlimpica({
    findPresentations: () => Promise.resolve(['p1']),
    quote: () => Promise.resolve(quote),
    now: () => observedAt,
  });
  await expect(pilot.execute(zone, [ean])).resolves.toEqual({
    mode: 'preview', zoneId: zone.id,
    rows: [{ ean, presentationId: 'p1', status: 'available', skuId: '516338',
      sellerId: zone.sellerId, priceCop: 1950, observedAt,
      expiresAt: new Date('2026-11-25T15:00:00Z') }],
  });
});
