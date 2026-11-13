import type {
  EstablishmentRepository,
  NearbyEstablishment,
  WithinRadiusQuery,
} from './establishment-repository';

// Puerta de entrada pública para que comparison describa las tiendas que tienen precio sin leer las
// tablas de establishments (grill de la #15, pregunta 2).
export class EstablishmentsWithinRadius {
  constructor(private readonly establishments: EstablishmentRepository) {}

  async find(query: WithinRadiusQuery): Promise<NearbyEstablishment[]> {
    if (query.ids.length === 0) return [];
    return this.establishments.findWithinRadius(query);
  }
}
