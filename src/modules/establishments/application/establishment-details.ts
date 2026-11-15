import type { EstablishmentDetail, EstablishmentRepository } from './establishment-repository';

// Puerta de entrada pública para los precios de una tienda (grill de la #28, pregunta 1).
export class EstablishmentDetails {
  constructor(private readonly establishments: EstablishmentRepository) {}

  find(establishmentId: string): Promise<EstablishmentDetail | null> {
    return this.establishments.findById(establishmentId);
  }
}
