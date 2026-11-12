import type { EstablishmentRepository } from './establishment-repository';

// Puerta de entrada pública para que pricing compruebe una tienda sin leer las tablas de
// establishments (grill de la #14, pregunta 5).
export class EstablishmentExists {
  constructor(private readonly establishments: EstablishmentRepository) {}

  exists(establishmentId: string): Promise<boolean> {
    return this.establishments.exists(establishmentId);
  }
}
