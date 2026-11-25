import type { EstablishmentRepository } from './establishment-repository';

// H36 (ADR-040): puerta de entrada pública para que otros módulos dejen fuera las tiendas retiradas.
export class RetiredEstablishments {
  constructor(private readonly establishments: Pick<EstablishmentRepository, 'retiredIds'>) {}

  ids(): Promise<string[]> {
    return this.establishments.retiredIds();
  }
}
