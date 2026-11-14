import type { AroundQuery, EstablishmentRepository } from './establishment-repository';

// Puerta de entrada pública para que reliability arme la zona de referencia de un precio sin leer
// las tablas de establishments (grill de la #31, pregunta 7). Incluye la tienda misma.
export class EstablishmentsAround {
  constructor(private readonly establishments: EstablishmentRepository) {}

  find(query: AroundQuery): Promise<string[]> {
    return this.establishments.findAround(query);
  }
}
