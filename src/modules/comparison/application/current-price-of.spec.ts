import { CurrentPriceOf } from './current-price-of';
import type { CurrentPrice } from './current-prices';

const observedAt = new Date('2026-11-14T15:00:00Z');
const price = (presentationId: string, priceCop: number): CurrentPrice => ({
  reportId: `reporte-${presentationId}`,
  presentationId,
  establishmentId: 'tienda-1',
  priceCop,
  observedAt,
  status: 'vigente',
});

// PR-22 (#93): lo que Valora publica para una presentación en una tienda, sin leer tablas de comparison.
describe('precio vigente de una presentación en una tienda (#93)', () => {
  const currentPrice = new CurrentPriceOf({
    findByEstablishment: (id) =>
      Promise.resolve(
        id === 'tienda-1' ? [price('arroz-500', 2500), price('arroz-1000', 4800)] : [],
      ),
  });

  it('da el precio publicado, su fecha y su estado', async () => {
    await expect(currentPrice.find('arroz-1000', 'tienda-1')).resolves.toEqual({
      priceCop: 4800,
      observedAt,
      status: 'vigente',
    });
  });

  it('sin precio en esa tienda, nada', async () => {
    await expect(currentPrice.find('arroz-500', 'tienda-2')).resolves.toBeNull();
  });
});
