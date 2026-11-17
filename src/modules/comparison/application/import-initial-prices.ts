import { initialPriceAction, type PriceSource } from '../../../domain/initial-price';

// B#135: un «Dato inicial» de la semilla (por ejemplo, el precio de la página de una cadena).
export interface NewInitialPrice {
  // Id fijo de la semilla; ocupa el lugar del reporte en price_current, sin cuenta de nadie (EC-08).
  id: string;
  presentationId: string;
  establishmentId: string;
  priceCop: number;
  observedAt: Date;
  sourceUrl: string;
}

// Puerto hacia price_current.
export interface InitialPriceStore {
  sourceAt(presentationId: string, establishmentId: string): Promise<PriceSource | undefined>;
  // Guarda o reemplaza el precio de esa tienda como «siembra».
  put(price: NewInitialPrice): Promise<void>;
}

// B#135: carga los datos iniciales en los precios vigentes. No pasan por pricing ni por
// reliability: no son reportes, así que no suben la confianza ni la reputación de nadie, no entran
// a la moderación ni al historial, y vencen con la vigencia de siempre.
export class ImportInitialPrices {
  constructor(private readonly store: InitialPriceStore) {}

  async execute(prices: NewInitialPrice[]): Promise<{ saved: number; kept: number }> {
    let saved = 0;
    for (const price of prices) {
      const current = await this.store.sourceAt(price.presentationId, price.establishmentId);
      if (initialPriceAction(current === undefined ? undefined : { source: current }) === 'keep') {
        continue;
      }
      await this.store.put(price);
      saved += 1;
    }
    return { saved, kept: prices.length - saved };
  }
}
