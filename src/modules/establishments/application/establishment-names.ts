import type { EstablishmentRepository } from './establishment-repository';

// Puerta de entrada pública para la cola de moderación (grill de la #32, pregunta 6). Solo devuelve
// los ids que existen.
export class EstablishmentNames {
  constructor(private readonly establishments: EstablishmentRepository) {}

  of(establishmentIds: string[]): Promise<Map<string, string>> {
    return this.establishments.namesOf(establishmentIds);
  }
}
