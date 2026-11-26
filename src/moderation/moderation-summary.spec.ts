import { ModerationSummary } from './moderation-summary';

const counting = (total: number) => ({ count: () => Promise.resolve(total) });

// #257: lo que muestran la campana y las pestañas del panel de moderación.
describe('resumen de pendientes de moderación (#257)', () => {
  it('con todas las colas vacías son cero', async () => {
    const summary = new ModerationSummary({
      prices: counting(0),
      storeProposals: counting(0),
      storeCorrections: counting(0),
      productRequests: counting(0),
      merchantCases: counting(0),
    });

    await expect(summary.execute()).resolves.toEqual({
      precios: 0,
      tiendas: 0,
      productos: 0,
      comercios: 0,
    });
  });

  it('tiendas suma las propuestas y las correcciones, que van en la misma pestaña', async () => {
    const summary = new ModerationSummary({
      prices: counting(4),
      storeProposals: counting(2),
      storeCorrections: counting(3),
      productRequests: counting(1),
      merchantCases: counting(7),
    });

    await expect(summary.execute()).resolves.toEqual({
      precios: 4,
      tiendas: 5,
      productos: 1,
      comercios: 7,
    });
  });

  // EC-08: son solo números; la respuesta no trae nada más que los cuatro conteos.
  it('devuelve solo los cuatro números', async () => {
    const summary = new ModerationSummary({
      prices: counting(1),
      storeProposals: counting(1),
      storeCorrections: counting(1),
      productRequests: counting(1),
      merchantCases: counting(1),
    });

    const result = await summary.execute();

    expect(Object.keys(result).sort()).toEqual(['comercios', 'precios', 'productos', 'tiendas']);
  });
});
