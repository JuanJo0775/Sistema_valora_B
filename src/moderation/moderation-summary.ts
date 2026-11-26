interface Counting {
  count(): Promise<number>;
}

export interface ModerationSummaryPorts {
  prices: Counting;
  storeProposals: Counting;
  storeCorrections: Counting;
  productRequests: Counting;
  merchantCases: Counting;
}

// Un número por pestaña del panel de moderación. Solo números, nunca quién reportó (EC-08).
export interface PendingByQueue {
  precios: number;
  tiendas: number;
  productos: number;
  comercios: number;
}

// #257: cuántos casos esperan decisión en cada cola, para la campana y las pestañas.
export class ModerationSummary {
  constructor(private readonly ports: ModerationSummaryPorts) {}

  async execute(): Promise<PendingByQueue> {
    const { prices, storeProposals, storeCorrections, productRequests, merchantCases } = this.ports;
    const [precios, proposals, corrections, productos, comercios] = await Promise.all([
      prices.count(),
      storeProposals.count(),
      storeCorrections.count(),
      productRequests.count(),
      merchantCases.count(),
    ]);
    // Las propuestas y las correcciones de tienda comparten la pestaña «Tiendas».
    return { precios, tiendas: proposals + corrections, productos, comercios };
  }
}
