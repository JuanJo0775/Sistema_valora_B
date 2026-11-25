export interface RetireEstablishmentPorts {
  stores: { retire(establishmentId: string, retiredAt: Date): Promise<boolean> };
  clock: { now(): Date };
}

// H36 (ADR-040): la tienda que elimina su creador sale del mapa sin destruir datos. Repetirlo no
// hace nada (el outbox puede entregar el evento más de una vez).
export class RetireEstablishment {
  constructor(private readonly ports: RetireEstablishmentPorts) {}

  async execute(establishmentId: string): Promise<void> {
    await this.ports.stores.retire(establishmentId, this.ports.clock.now());
  }
}
