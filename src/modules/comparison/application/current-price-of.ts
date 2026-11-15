import type { CurrentPrice, CurrentPrices } from './current-prices';

export type PublishedPrice = Pick<CurrentPrice, 'priceCop' | 'observedAt' | 'status'>;

// Consulta pública (PR-22, #93): el precio que Valora publica para una presentación en una tienda, para
// contrastarlo con el observado por el equipo sin leer las tablas de comparison.
export class CurrentPriceOf {
  constructor(private readonly prices: Pick<CurrentPrices, 'findByEstablishment'>) {}

  async find(presentationId: string, establishmentId: string): Promise<PublishedPrice | null> {
    const prices = await this.prices.findByEstablishment(establishmentId);
    const price = prices.find((candidate) => candidate.presentationId === presentationId);
    return price
      ? { priceCop: price.priceCop, observedAt: price.observedAt, status: price.status }
      : null;
  }
}
