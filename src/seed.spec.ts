import type { InitialPrice, InitialPricesResult } from './modules/imports';
import { seedInitialPrices } from './seed';

const price = (establishmentId: string): InitialPrice => ({
  id: `initial-${establishmentId}`,
  presentationId: 'arroz-500g',
  establishmentId,
  priceCop: 1990,
  observedAt: new Date('2026-11-16T12:00:00-05:00'),
  sourceUrl: 'https://www.d1.com.co/arroz-diana-500g-12002073/p',
});

const reading = (result: InitialPricesResult) => ({ read: () => Promise.resolve(result) });

// B#135: pnpm db:seed prepara los datos iniciales en imports y los guarda en comparison.
describe('datos iniciales en pnpm db:seed', () => {
  it('guarda los precios de cada tienda de la cadena y cuenta dónde ya había precio de la comunidad', async () => {
    const saved: InitialPrice[][] = [];
    const load = {
      execute: (prices: InitialPrice[]) => {
        saved.push(prices);
        return Promise.resolve({ saved: 1, kept: 1 });
      },
    };

    const summary = await seedInitialPrices(
      reading({ ok: true, prices: [price('d1-centro'), price('d1-norte')], skipped: 2 }),
      load,
    );

    expect(saved).toEqual([[price('d1-centro'), price('d1-norte')]]);
    expect(summary).toEqual({ ok: true, saved: 1, kept: 1, skipped: 2 });
  });

  it('con una fila inválida no guarda ningún dato inicial y devuelve los errores', async () => {
    const load = { execute: jest.fn() };

    const summary = await seedInitialPrices(
      reading({
        ok: false,
        errors: ['precios-iniciales.csv, fila 3: el precio debe ser un entero'],
      }),
      load,
    );

    expect(summary).toEqual({
      ok: false,
      errors: ['precios-iniciales.csv, fila 3: el precio debe ser un entero'],
    });
    expect(load.execute).not.toHaveBeenCalled();
  });
});
