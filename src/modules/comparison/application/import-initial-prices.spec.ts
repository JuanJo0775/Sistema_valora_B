import type { PriceSource } from '../../../domain/initial-price';
import {
  ImportInitialPrices,
  type InitialPriceStore,
  type NewInitialPrice,
} from './import-initial-prices';

const place = (price: { presentationId: string; establishmentId: string }) =>
  `${price.presentationId}:${price.establishmentId}`;

// La tabla price_current en memoria: solo lo que importa para decidir.
class InMemoryInitialPrices implements InitialPriceStore {
  readonly rows = new Map<string, NewInitialPrice & { source: PriceSource }>();

  sourceAt(presentationId: string, establishmentId: string): Promise<PriceSource | undefined> {
    return Promise.resolve(this.rows.get(place({ presentationId, establishmentId }))?.source);
  }

  put(price: NewInitialPrice): Promise<void> {
    this.rows.set(place(price), { ...price, source: 'siembra' });
    return Promise.resolve();
  }
}

const rice = (establishmentId: string, priceCop = 1990): NewInitialPrice => ({
  id: `a0000000-0000-4000-8000-00000000000${establishmentId}`,
  presentationId: 'arroz-500g',
  establishmentId,
  priceCop,
  observedAt: new Date('2026-11-16T12:00:00-05:00'),
  sourceUrl: 'https://www.d1.com.co/arroz-diana-500g-12002073/p',
});

describe('cargar datos iniciales en los precios vigentes (B#135)', () => {
  it('llena las tiendas sin precio y deja como está lo que vio la comunidad', async () => {
    const store = new InMemoryInitialPrices();
    store.rows.set('arroz-500g:2', { ...rice('2', 2500), source: 'comunidad' });

    const summary = await new ImportInitialPrices(store).execute([rice('1'), rice('2')]);

    expect(summary).toEqual({ saved: 1, kept: 1 });
    expect(store.rows.get('arroz-500g:1')).toMatchObject({ priceCop: 1990, source: 'siembra' });
    expect(store.rows.get('arroz-500g:2')).toMatchObject({ priceCop: 2500, source: 'comunidad' });
  });

  it('volver a sembrar actualiza el dato inicial sin duplicarlo', async () => {
    const store = new InMemoryInitialPrices();
    const load = new ImportInitialPrices(store);

    await load.execute([rice('1', 1990)]);
    const summary = await load.execute([rice('1', 2090)]);

    expect(summary).toEqual({ saved: 1, kept: 0 });
    expect(store.rows.size).toBe(1);
    expect(store.rows.get('arroz-500g:1')?.priceCop).toBe(2090);
  });
});
